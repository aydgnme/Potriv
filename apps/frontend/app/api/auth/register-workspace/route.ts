import { NextResponse, type NextRequest } from "next/server";

import { GENERIC_SERVER_MESSAGE, productAuthError } from "@/modules/auth/model/errors";
import { validateWorkspaceRegistration } from "@/modules/auth/model/workspaceRegistration";
import { registerWorkspace } from "@/modules/auth/server/backendAuth";
import { jsonError, noStore } from "@/modules/auth/server/httpResponse";
import { isSameOrigin } from "@/modules/auth/server/sameOrigin";

export const dynamic = "force-dynamic";

/**
 * Requests a workspace: an organization and a first administrator, pending
 * confirmation of the email address.
 *
 * The narrowest possible boundary over `POST /auth/register-admin`: validate,
 * delegate, answer. It sets no cookie and reads none — there is no session
 * here to get wrong, and nothing is created by this request at all; a
 * confirmation link is mailed separately, and `POST
 * /api/auth/register-workspace/verify` is what actually creates anything.
 *
 * The response carries only a fixed message and the email the caller
 * themselves just submitted — nothing learned from the backend, and nothing
 * that differs whether or not the address already has an account. See
 * `registerWorkspace`.
 */
export async function POST(request: NextRequest) {
  // Same guard as every other state-changing auth route.
  if (!isSameOrigin(request)) {
    return jsonError(productAuthError("SERVER", GENERIC_SERVER_MESSAGE), 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(productAuthError("VALIDATION", "Check the details and try again."), 400);
  }

  const validated = validateWorkspaceRegistration(
    (body ?? {}) as Record<string, unknown>,
  );
  if (!validated.ok) {
    return noStore(
      NextResponse.json(
        { error: productAuthError("VALIDATION", "Check the details and try again."),
          fieldErrors: validated.errors },
        { status: 400 },
      ),
    );
  }

  const outcome = await registerWorkspace(
    validated.value,
    request.headers.get("user-agent"),
  );

  if (!outcome.ok) {
    return jsonError(outcome.error, outcome.error.code === "VALIDATION" ? 400 : 502);
  }

  return noStore(
    NextResponse.json(
      {
        accepted: true,
        email: validated.value.email,
        message:
          "If this email address can be used to create a workspace, "
          + "a confirmation link has been sent to it.",
      },
      { status: 202 },
    ),
  );
}
