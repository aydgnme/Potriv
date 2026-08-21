import { NextResponse, type NextRequest } from "next/server";

import { GENERIC_SERVER_MESSAGE, productAuthError } from "@/modules/auth/model/errors";
import { COOKIE_NAMES } from "@/modules/auth/server/authConfig";
import { clearAuthCookies } from "@/modules/auth/server/authCookies";
import { logoutAll } from "@/modules/auth/server/backendAuth";
import { jsonError, noStore } from "@/modules/auth/server/httpResponse";
import { isSameOrigin } from "@/modules/auth/server/sameOrigin";

export const dynamic = "force-dynamic";

/**
 * Signs out of every session, including this one.
 *
 * POST and same-origin, like every other session mutation: this revokes
 * credentials, and a GET would be triggerable by any image tag on any page.
 *
 * **The reported outcome is the backend's, not this route's.** "Sign out
 * everywhere" promises something about other devices that this browser cannot
 * deliver by clearing its own cookies, so the response says whether the remote
 * revocation actually happened. Reporting success because the local half worked
 * would leave somebody believing a stolen session was closed.
 *
 * Local cookies are cleared either way. Whatever happened elsewhere, the person
 * asked to be signed out here, and a browser that still looks authenticated
 * after that is the worse failure — the same reasoning as ordinary sign out.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return jsonError(productAuthError("SERVER", GENERIC_SERVER_MESSAGE), 403);
  }

  const accessToken = request.cookies.get(COOKIE_NAMES.access)?.value;
  // No access cookie means there is nothing to revoke remotely and no way to ask.
  // The local half still runs, and the answer is honest about the remote half.
  const revokedEverywhere = accessToken ? await logoutAll(accessToken) : false;

  const response = noStore(
    NextResponse.json({ authenticated: false, revokedEverywhere }),
  );
  clearAuthCookies(response);
  return response;
}
