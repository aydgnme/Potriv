import { NextResponse, type NextRequest } from "next/server";

import { COOKIE_NAMES } from "@/modules/auth/server/authConfig";
import { applyTokenPair, clearAuthCookies } from "@/modules/auth/server/authCookies";
import { noStore } from "@/modules/auth/server/httpResponse";
import { refreshOnce } from "@/modules/auth/server/refreshSingleFlight";
import { isSafeRefreshNavigation } from "@/modules/auth/server/sameOrigin";
import { safeReturnTo } from "@/modules/auth/utils/returnTo";

export const dynamic = "force-dynamic";

/**
 * The controlled recovery path: exchange the refresh cookie for a new pair and
 * continue to where the user was going.
 *
 * Reached by a proxy redirect when the access cookie has expired but the
 * refresh cookie has not. `returnTo` is validated before it is used — this route
 * sets credentials and then redirects, so an unvalidated destination would be an
 * open redirect with a session attached.
 *
 * A failed refresh clears the cookies and sends the user to login. It is never
 * retried: presenting a rotated token twice is exactly what makes the backend
 * revoke the whole session.
 */
export async function GET(request: NextRequest) {
  const destination = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const loginUrl = new URL("/login", request.nextUrl.origin);

  // A cross-site navigation must not be able to drive a credential rotation.
  // Stricter than the POST routes: this one fails closed when the request
  // carries no origin signal at all, rather than assuming that means a
  // non-browser caller.
  if (!isSafeRefreshNavigation(request)) {
    return noStore(NextResponse.redirect(loginUrl));
  }

  const refreshToken = request.cookies.get(COOKIE_NAMES.refresh)?.value;
  if (!refreshToken) {
    return noStore(NextResponse.redirect(loginUrl));
  }

  const result = await refreshOnce(refreshToken);
  if (!result.ok) {
    const response = noStore(NextResponse.redirect(loginUrl));
    clearAuthCookies(response);
    return response;
  }

  const response = noStore(
    NextResponse.redirect(new URL(destination, request.nextUrl.origin)),
  );
  applyTokenPair(response, result.value);
  return response;
}
