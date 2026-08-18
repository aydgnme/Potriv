import { NextResponse, type NextRequest } from "next/server";

import { GENERIC_SERVER_MESSAGE, productAuthError } from "@/modules/auth/model/errors";
import { validateInviteRegistration } from "@/modules/auth/model/inviteRegistration";
import { registerWithInvite } from "@/modules/auth/server/backendAuth";
import { jsonError, noStore } from "@/modules/auth/server/httpResponse";
import { isSameOrigin } from "@/modules/auth/server/sameOrigin";

export const dynamic = "force-dynamic";

/**
 * Registers an employee from an invitation.
 *
 * The narrowest boundary over `POST /auth/register-employee/{token}`: validate,
 * delegate, answer. It sets no cookie and reads none, because that contract
 * returns no tokens — there is no session here to get wrong.
 *
 * The invite token arrives in the **request body** rather than this route's own
 * path. That keeps it out of the browser's address bar for this request, out of
 * any server access log that records paths, and out of the `Referer` any
 * subsequent navigation would send. It is read once, forwarded, and never
 * echoed back in the response.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return jsonError(productAuthError("SERVER", GENERIC_SERVER_MESSAGE), 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(productAuthError("VALIDATION", "Check the details and try again."), 400);
  }

  const record = (body ?? {}) as Record<string, unknown>;
  const token = typeof record.token === "string" ? record.token : "";
  if (!token) {
    // No token at all is treated exactly like a dead one.
    return noStore(
      NextResponse.json(
        { error: { code: "INVITE_INVALID", message: "This invite is no longer valid." } },
        { status: 400 },
      ),
    );
  }

  const validated = validateInviteRegistration(record);
  if (!validated.ok) {
    return noStore(
      NextResponse.json(
        {
          error: productAuthError("VALIDATION", "Check the details and try again."),
          fieldErrors: validated.errors,
        },
        { status: 400 },
      ),
    );
  }

  const outcome = await registerWithInvite(
    token,
    validated.value,
    request.headers.get("user-agent"),
  );

  if (!outcome.ok) {
    const status = outcome.failure === "SERVER" || outcome.failure === "NETWORK" ? 502 : 400;
    return noStore(
      NextResponse.json(
        { error: { code: outcome.failure, message: outcome.message } },
        { status },
      ),
    );
  }

  /**
   * Created, and deliberately not signed in — the same rule create-workspace
   * follows, for the same reason: the backend issues no token pair here, so a
   * session would have to be fabricated. The response carries the email so the
   * success screen can name the account, and nothing else.
   */
  return noStore(
    NextResponse.json({ created: true, email: validated.value.email }, { status: 201 }),
  );
}
