import "server-only";

import { NextResponse } from "next/server";

import type { ProductAuthError } from "../model/errors";

/**
 * Session responses must never be cached — not by the browser, and above all not
 * by a shared cache that could hand one user's identity to another.
 */
export function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function jsonError(error: ProductAuthError, status: number): NextResponse {
  return noStore(NextResponse.json({ error }, { status }));
}

export function jsonOk(body: unknown, status = 200): NextResponse {
  return noStore(NextResponse.json(body, { status }));
}
