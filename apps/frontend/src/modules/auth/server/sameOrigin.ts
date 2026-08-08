import "server-only";

import type { NextRequest } from "next/server";

/**
 * Decides whether a credential-changing request really came from our own pages.
 *
 * `SameSite=Lax` is not enough on its own here. Lax cookies **are** sent on
 * top-level cross-site GET navigations, and `/api/auth/refresh` is reached by a
 * GET that rotates tokens — so a link on another site could otherwise force a
 * rotation. Fetch Metadata closes that: a browser reports `Sec-Fetch-Site`
 * itself and a page cannot forge it.
 *
 * The decision is a pure function of four header values so it can be tested
 * without constructing a framework request.
 */

export type OriginSignals = {
  /** `Sec-Fetch-Site`, or null where the browser does not send it. */
  readonly secFetchSite: string | null;
  readonly origin: string | null;
  readonly referer: string | null;
  /**
   * The origin this deployment answers on, taken from the resolved request URL
   * so it already reflects whatever `Host`/forwarded headers the platform
   * trusts. This task deliberately does not build a proxy-trust framework: if a
   * reverse proxy rewrites the origin, Next must be configured to see it — the
   * same requirement redirects and absolute URLs already have.
   */
  readonly expectedOrigin: string;
};

/** scheme + host + port, so http:// and https:// never compare equal. */
function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function isSameOriginRequest(signals: OriginSignals): boolean {
  const expected = normalizeOrigin(signals.expectedOrigin);
  if (!expected) return false;

  const site = signals.secFetchSite?.toLowerCase() ?? null;

  if (site === "cross-site") return false;
  // A sibling subdomain is same-*site* but a different origin, and this boundary
  // is about origins.
  if (site === "same-site") return false;

  // `none` means the user initiated it directly — typed URL, bookmark. A page
  // cannot cause that, so it is not the threat this guards against.
  if (site !== null && site !== "same-origin" && site !== "none") return false;

  // Whatever Fetch Metadata said, a present Origin must agree exactly.
  if (signals.origin !== null) {
    return normalizeOrigin(signals.origin) === expected;
  }

  if (signals.referer !== null) {
    return normalizeOrigin(signals.referer) === expected;
  }

  // No Origin and no Referer. Safe only because Fetch Metadata already ruled
  // out cross-site above; a modern browser always sends `Sec-Fetch-Site`.
  if (site !== null) return true;

  // No Fetch Metadata at all: not a modern browser, so not the CSRF threat
  // model, which needs a browser that carries cookies. Allowed so that
  // non-browser same-origin callers keep working.
  return true;
}

export function isSameOrigin(request: NextRequest): boolean {
  return isSameOriginRequest({
    secFetchSite: request.headers.get("sec-fetch-site"),
    origin: request.headers.get("origin"),
    referer: request.headers.get("referer"),
    expectedOrigin: request.nextUrl.origin,
  });
}
