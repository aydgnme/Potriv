import { NextResponse, type NextRequest } from "next/server";

/**
 * Coarse routing based on cookie presence — and nothing more.
 *
 * Middleware runs on the edge without the backend, so it cannot know whether a
 * token is valid, who it belongs to, or what they may do. It therefore makes no
 * authorization decision: a present access cookie only earns the request the
 * chance to be checked properly by the protected layout, which asks
 * `/auth/me`.
 *
 * Cookie names are duplicated here rather than imported because the auth module
 * is `server-only` and this file runs in the edge runtime. The comment is the
 * link; there are two of them and they change roughly never.
 */
const ACCESS_COOKIE = "potriv_access_token";
const REFRESH_COOKIE = "potriv_refresh_token";

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const hasAccess = Boolean(request.cookies.get(ACCESS_COOKIE)?.value);
  if (hasAccess) return NextResponse.next();

  // The access token has expired but the session may still be recoverable. Send
  // the request through the one controlled refresh path rather than letting each
  // page invent its own recovery.
  const hasRefresh = Boolean(request.cookies.get(REFRESH_COOKIE)?.value);
  if (hasRefresh) {
    const refreshUrl = new URL("/api/auth/refresh", request.nextUrl.origin);
    refreshUrl.searchParams.set("returnTo", `${pathname}${search}`);
    return NextResponse.redirect(refreshUrl);
  }

  return NextResponse.redirect(new URL("/login", request.nextUrl.origin));
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
