import { NextResponse, type NextRequest } from "next/server";

import { GENERIC_SERVER_MESSAGE, productAuthError } from "@/modules/auth/model/errors";
import { COOKIE_NAMES } from "@/modules/auth/server/authConfig";
import { clearAuthCookies } from "@/modules/auth/server/authCookies";
import { logout } from "@/modules/auth/server/backendAuth";
import { jsonError, noStore } from "@/modules/auth/server/httpResponse";
import { isSameOrigin } from "@/modules/auth/server/sameOrigin";

export const dynamic = "force-dynamic";

/**
 * Signs out. POST, never GET: signing out mutates a session, and a GET would be
 * triggerable by any image tag on any page.
 *
 * The backend call is best effort; the local cookies are cleared either way.
 * Leaving a browser that looks signed in but is not would be the worse outcome.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return jsonError(productAuthError("SERVER", GENERIC_SERVER_MESSAGE), 403);
  }

  const accessToken = request.cookies.get(COOKIE_NAMES.access)?.value;
  if (accessToken) {
    await logout(accessToken);
  }

  const response = noStore(NextResponse.json({ authenticated: false }));
  clearAuthCookies(response);
  return response;
}
