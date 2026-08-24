import { NextResponse, type NextRequest } from "next/server";

import { GENERIC_SERVER_MESSAGE, productAuthError } from "@/modules/auth/model/errors";
import { confirmWorkspaceRegistration } from "@/modules/auth/server/backendAuth";
import { jsonError, noStore } from "@/modules/auth/server/httpResponse";
import { isSameOrigin } from "@/modules/auth/server/sameOrigin";

export const dynamic = "force-dynamic";

/**
 * Confirms a workspace registration and creates the organization and its
 * first administrator — the only route that does.
 *
 * The token is read from the request body, forwarded once and then
 * forgotten: never logged, never written to a cookie, never stored. It
 * reaches here from the URL fragment the confirmation page reads it out of,
 * never from a query string or path segment.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return jsonError(productAuthError("SERVER", GENERIC_SERVER_MESSAGE), 403);
  }

  let token: string | null = null;
  try {
    const body = (await request.json()) as Record<string, unknown> | null;
    token = typeof body?.token === "string" ? body.token : null;
  } catch {
    // Fall through to the validation error below.
  }

  if (!token) {
    return jsonError(
      productAuthError("VALIDATION", "Check the details and try again."),
      400,
    );
  }

  const outcome = await confirmWorkspaceRegistration(token);
  if (!outcome.ok) {
    return jsonError(outcome.error, outcome.error.code === "SERVER" ? 502 : 400);
  }

  /**
   * Created, and deliberately not signed in.
   *
   * `register-admin/verify` returns no token pair, so auto-login would mean
   * either replaying the password against `/auth/login` or fabricating a
   * session. Neither is something this route should do quietly, so the
   * administrator is told to sign in — which is what actually happens.
   */
  return noStore(
    NextResponse.json(
      {
        organizationId: outcome.value.organizationId,
        userId: outcome.value.userId,
      },
      { status: 201 },
    ),
  );
}
