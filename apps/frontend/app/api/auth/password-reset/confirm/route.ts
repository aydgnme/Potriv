import { type NextRequest } from "next/server";

import { GENERIC_SERVER_MESSAGE, productAuthError } from "@/modules/auth/model/errors";
import { confirmPasswordReset } from "@/modules/auth/server/backendAuth";
import { jsonError, jsonOk } from "@/modules/auth/server/httpResponse";
import { isSameOrigin } from "@/modules/auth/server/sameOrigin";

export const dynamic = "force-dynamic";

/**
 * Sets a new password from a reset token.
 *
 * The token is read from the request, forwarded once and then forgotten: never
 * logged, never written to a cookie, never stored. A successful reset revokes
 * every session on the backend, so the user is sent to sign in again rather than
 * being logged in from the token.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return jsonError(productAuthError("SERVER", GENERIC_SERVER_MESSAGE), 403);
  }

  let token: string | null = null;
  let newPassword: string | null = null;
  try {
    const body = (await request.json()) as Record<string, unknown> | null;
    token = typeof body?.token === "string" ? body.token : null;
    newPassword = typeof body?.newPassword === "string" ? body.newPassword : null;
  } catch {
    // Fall through to the validation error below.
  }

  if (!token || !newPassword) {
    return jsonError(
      productAuthError("VALIDATION", "Enter a new password."),
      400,
    );
  }

  const result = await confirmPasswordReset(token, newPassword);
  if (!result.ok) {
    return jsonError(result.error, result.error.code === "SERVER" ? 502 : 400);
  }

  return jsonOk({ reset: true });
}
