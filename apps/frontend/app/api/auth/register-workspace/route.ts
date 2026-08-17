import { NextResponse, type NextRequest } from "next/server";

import { GENERIC_SERVER_MESSAGE, productAuthError } from "@/modules/auth/model/errors";
import { validateWorkspaceRegistration } from "@/modules/auth/model/workspaceRegistration";
import { registerWorkspace } from "@/modules/auth/server/backendAuth";
import { jsonError, noStore } from "@/modules/auth/server/httpResponse";
import { isSameOrigin } from "@/modules/auth/server/sameOrigin";

export const dynamic = "force-dynamic";

/**
 * Creates an organization and its first administrator.
 *
 * The narrowest possible boundary over `POST /auth/register-admin`: validate,
 * delegate, answer. It sets no cookie and reads none, because the backend
 * contract returns no tokens — there is no session here to get wrong.
 *
 * The response carries only a flag and the new administrator's email, echoed so
 * the success screen can name the account to sign in with. No identifiers, no
 * invite URL, and nothing the browser did not already send.
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

  /**
   * Created, and deliberately not signed in.
   *
   * `register-admin` returns no token pair, so auto-login would mean either
   * replaying the password against `/auth/login` or fabricating a session.
   * Neither is something a registration route should do quietly, so the
   * administrator is told to sign in — which is what actually happens.
   */
  return noStore(
    NextResponse.json({ created: true, email: validated.value.email }, { status: 201 }),
  );
}
