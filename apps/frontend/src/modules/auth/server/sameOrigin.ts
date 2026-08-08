import "server-only";

import type { NextRequest } from "next/server";

/**
 * Rejects cross-site requests to session-mutating endpoints.
 *
 * `SameSite=Lax` already stops a cross-site POST from carrying our cookies, so
 * this is a second, cheap layer rather than the only one — enough to make a
 * dedicated CSRF framework unnecessary for a same-origin BFF.
 *
 * A request with neither header is allowed: same-origin `fetch` in some browsers
 * omits both, and refusing those would break ordinary use to defend against
 * nothing the cookie policy has not already handled.
 */
export function isSameOrigin(request: NextRequest): boolean {
  const host = request.headers.get("host");
  if (!host) return false;

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).host === host;
    } catch {
      return false;
    }
  }

  return true;
}
