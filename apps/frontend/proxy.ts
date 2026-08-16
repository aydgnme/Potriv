import { NextResponse, type NextRequest } from "next/server";

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

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

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
 * Product routes only.
 *
 * Deliberately excluded: `/login`, `/forgot-password` and `/reset-password`
 * (guarding them would lock out the people who need them most), `/console` (a
 * developer tool with its own token), `/api/auth/*` (the recovery path itself —
 * guarding it would loop), and Next's own assets.
 */
export const config = {
  matcher: [
    "/home/:path*",
    "/projects/:path*",
    "/staffing/:path*",
    "/people/:path*",
    "/skills/:path*",
    "/organization/:path*",
  ],
};
