import { NextResponse, type NextRequest } from "next/server";

import {
  buildContentSecurityPolicy,
  generateNonce,
  isSensitiveRoute,
} from "@/shared/security/contentSecurityPolicy";

/**
 * Coarse routing based on cookie presence — and nothing more.
 *
 * Next 16 renames this convention from `middleware` to `proxy`; the file moved
 * and the export was renamed, and nothing else about it changed. It still runs
 * before the request reaches a route, still without the backend, so it still
 * cannot know whether a token is valid, who it belongs to, or what they may do.
 * It therefore makes no authorization decision: a present access cookie only
 * earns the request the chance to be checked properly by the protected layout,
 * which asks `/auth/me`. That layout remains the authority.
 *
 * Cookie names are duplicated here rather than imported because the auth module
 * is `server-only` and this file runs outside that boundary. The comment is the
 * link; there are two of them and they change roughly never.
 */
const ACCESS_COOKIE = "potriv_access_token";
const REFRESH_COOKIE = "potriv_refresh_token";

/**
 * Methods that may be repeated verbatim at a new location without consequence.
 *
 * Everything else is treated as a mutation, including verbs not listed at all,
 * so an unfamiliar method fails to the careful branch rather than the cheap one.
 */
const SAFE_METHODS = new Set(["GET", "HEAD"]);

/**
 * The redirect status to recover with.
 *
 * 307 repeats the request as-is — right for a navigation, wrong for a mutation.
 * Protected routes host Server Actions, which arrive as POST to the page's own
 * URL, and a 307 would re-issue that POST, body included, against the GET-only
 * refresh route: a 405 instead of a recovered session, and the user's form data
 * delivered to an endpoint with no reason to see it.
 *
 * 303 See Other is the status for exactly this. The client must re-issue as GET
 * and drop the body, so an interrupted mutation degrades into an ordinary
 * navigation: session recovered, user back on their page, and the action left
 * for them to repeat on purpose. Next 16's Server Action client follows the
 * redirect chain and reloads the route rather than retrying the action.
 */
function recoveryStatus(method: string): 303 | 307 {
  return SAFE_METHODS.has(method) ? 307 : 303;
}

/**
 * Serves a credential-bearing page under a nonce-based Content-Security-Policy.
 *
 * The policy itself lives in `@/shared/security/contentSecurityPolicy` and is
 * tested there. This function is the wiring, and the wiring is the part that is
 * quietly easy to get wrong:
 *
 *  - the policy must go on the **request** headers as well as the response.
 *    Next reads `Content-Security-Policy` off the incoming request to discover
 *    the nonce it should stamp onto its own `<script>` tags. Setting it only on
 *    the response yields a policy that is enforced and a page that cannot
 *    hydrate — which reads as the framework being broken rather than as the
 *    header being in one place instead of two;
 *  - a fresh nonce per request, never a constant. A reused nonce is an
 *    allow-list entry that an injected script can simply copy.
 */
function withContentSecurityPolicy(request: NextRequest): NextResponse {
  const nonce = generateNonce();
  const policy = buildContentSecurityPolicy({
    nonce,
    development: process.env.NODE_ENV !== "production",
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);

  /*
    No third-party analytics or RUM on these pages — enforced by `script-src`
    and `connect-src` rather than by remembering not to add one. This header
    removes the remaining passive signal: without it, following any link from a
    page whose URL said `/invite` would tell the destination that this reader is
    mid-invitation.

    `/invite` and `/reset-password` already carry it from `next.config.ts`;
    setting it here covers `/login`, `/forgot-password` and `/create-workspace`
    too, and keeps the protected set in one list.
  */
  response.headers.set("Referrer-Policy", "no-referrer");

  return response;
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  /*
    The credential-bearing pages, first and returning.

    These are public by design — guarding them would lock out exactly the people
    who need them — so none of the cookie logic below applies. What they need
    instead is a policy that stops an injected script reading the token out of
    the fragment before the page scrubs it, or key-logging the password field.
  */
  if (isSensitiveRoute(pathname)) {
    return withContentSecurityPolicy(request);
  }

  const hasAccess = Boolean(request.cookies.get(ACCESS_COOKIE)?.value);
  if (hasAccess) return NextResponse.next();

  const status = recoveryStatus(request.method);

  // The access token has expired but the session may still be recoverable. Send
  // the request through the one controlled refresh path rather than letting each
  // page invent its own recovery.
  const hasRefresh = Boolean(request.cookies.get(REFRESH_COOKIE)?.value);
  if (hasRefresh) {
    const refreshUrl = new URL("/api/auth/refresh", request.nextUrl.origin);
    refreshUrl.searchParams.set("returnTo", `${pathname}${search}`);
    return NextResponse.redirect(refreshUrl, status);
  }

  return NextResponse.redirect(new URL("/login", request.nextUrl.origin), status);
}

/**
 * Two disjoint sets, for two unrelated reasons.
 *
 * **Product routes** get the session-recovery redirect. Deliberately excluded
 * from that treatment: the credential-bearing pages below (guarding them would
 * lock out the people who need them most), `/console` (a developer tool with
 * its own token, and one that only exists under the development server — see
 * `next.config.ts`), `/api/auth/*` (the recovery path itself — guarding it
 * would loop), and Next's own assets.
 *
 * **Credential-bearing pages** get the strict CSP and nothing else; `proxy`
 * returns before it reads a cookie. They are listed explicitly rather than by
 * prefix, because a nonce forces per-request rendering and every route named
 * here must therefore declare `dynamic = "force-dynamic"` — widening the list
 * by accident would leave a prerendered page whose own hydration script the
 * policy then blocks. `contentSecurityPolicy.test.ts` asserts this list and
 * `SENSITIVE_ROUTES` stay in step, and that each named page is force-dynamic.
 */
export const config = {
  matcher: [
    "/home/:path*",
    "/projects/:path*",
    "/staffing/:path*",
    "/people/:path*",
    "/skills/:path*",
    "/organization/:path*",
    /* Spelled out rather than spread from `SENSITIVE_ROUTES`: Next evaluates
       this object statically at build time and an imported value is not
       available to it. The test keeps the two lists identical. */
    "/invite",
    "/reset-password",
    "/forgot-password",
    "/login",
    "/create-workspace",
    "/create-workspace/verify",
  ],
};
