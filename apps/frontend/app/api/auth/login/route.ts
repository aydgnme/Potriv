import { NextResponse, type NextRequest } from "next/server";

import {
  GENERIC_SERVER_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  productAuthError,
} from "@/modules/auth/model/errors";
import { applyTokenPair } from "@/modules/auth/server/authCookies";
import { login } from "@/modules/auth/server/backendAuth";
import { isSameOrigin } from "@/modules/auth/server/sameOrigin";
import { toProductUser } from "@/modules/auth/server/productSession";

export const dynamic = "force-dynamic";

/**
 * Exchanges credentials for cookies.
 *
 * The response body carries the sanitized user and **never a token** — that is
 * the entire reason this route exists rather than the browser calling the
 * backend directly.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return noStore(NextResponse.json({ error: productAuthError("SERVER", GENERIC_SERVER_MESSAGE) }, { status: 403 }));
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStore(NextResponse.json({ error: productAuthError("VALIDATION", "Enter your email and password.") }, { status: 400 }));
  }

  const email = readString(body, "email");
  const password = readString(body, "password");
  if (!email || !password) {
    return noStore(NextResponse.json({ error: productAuthError("VALIDATION", "Enter your email and password.") }, { status: 400 }));
  }

  const result = await login(email, password, request.headers.get("user-agent"));
  if (!result.ok) {
    return noStore(NextResponse.json({ error: result.error }, { status: 401 }));
  }

  // A session with no ordinary product role — SYSTEM_ADMIN alone, for instance —
  // cannot enter the product, and no cookies are written for it.
  const user = toProductUser(result.value, result.value.name);
  if (!user) {
    return noStore(
      NextResponse.json(
        { error: productAuthError("INVALID_CREDENTIALS", INVALID_CREDENTIALS_MESSAGE) },
        { status: 403 },
      ),
    );
  }

  const response = noStore(NextResponse.json({ authenticated: true, user }));
  applyTokenPair(response, result.value);
  return response;
}

function readString(body: unknown, key: string): string | null {
  if (!body || typeof body !== "object") return null;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  return response;
}
