import { type NextRequest } from "next/server";

import { GENERIC_SERVER_MESSAGE, productAuthError } from "@/modules/auth/model/errors";
import { requestPasswordReset } from "@/modules/auth/server/backendAuth";
import { jsonError, jsonOk } from "@/modules/auth/server/httpResponse";
import { isSameOrigin } from "@/modules/auth/server/sameOrigin";

export const dynamic = "force-dynamic";

/**
 * Asks for a reset link.
 *
 * The response is identical whether or not an account exists — the backend
 * answers 202 either way, and this route must not add a distinction it worked to
 * avoid.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return jsonError(productAuthError("SERVER", GENERIC_SERVER_MESSAGE), 403);
  }

  let email: string | null = null;
  try {
    const body: unknown = await request.json();
    const value = (body as Record<string, unknown> | null)?.email;
    email = typeof value === "string" ? value : null;
  } catch {
    email = null;
  }

  if (!email) {
    return jsonError(productAuthError("VALIDATION", "Enter a valid email address."), 400);
  }

  const result = await requestPasswordReset(email);
  if (!result.ok) return jsonError(result.error, result.error.code === "VALIDATION" ? 400 : 502);

  return jsonOk({ requested: true }, 202);
}
