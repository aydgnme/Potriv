import { NextResponse, type NextRequest } from "next/server";

import { GENERIC_SERVER_MESSAGE, productAuthError } from "@/modules/auth/model/errors";
import { authenticateForProduct } from "@/modules/auth/server/authenticate";
import { applyTokenPair } from "@/modules/auth/server/authCookies";
import { jsonError, noStore } from "@/modules/auth/server/httpResponse";
import { loginFailureStatus } from "@/modules/auth/server/loginOutcome";
import { isSameOrigin } from "@/modules/auth/server/sameOrigin";

export const dynamic = "force-dynamic";

/**
 * Exchanges credentials for cookies.
 *
 * Parse, delegate, set cookies, answer. Signing in — including revoking a
 * backend session the product cannot accept — belongs to the auth module.
 *
 * The response body carries the sanitized user and **never a token**, which is
 * the entire reason this route exists rather than the browser calling the
 * backend directly.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return jsonError(productAuthError("SERVER", GENERIC_SERVER_MESSAGE), 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(productAuthError("VALIDATION", "Enter your email and password."), 400);
  }

  const email = readString(body, "email");
  const password = readString(body, "password");
  if (!email || !password) {
    return jsonError(productAuthError("VALIDATION", "Enter your email and password."), 400);
  }

  const outcome = await authenticateForProduct(
    email,
    password,
    request.headers.get("user-agent"),
  );

  if (!outcome.ok) {
    // The status distinguishes a wrong password from an unreachable backend;
    // the message stays identical for every credential failure.
    return jsonError(outcome.error, loginFailureStatus(outcome.error.code));
  }

  const response = noStore(NextResponse.json({ authenticated: true, user: outcome.user }));
  applyTokenPair(response, outcome.tokens);
  return response;
}

function readString(body: unknown, key: string): string | null {
  if (!body || typeof body !== "object") return null;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}
