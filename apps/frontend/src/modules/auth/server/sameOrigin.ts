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
 * The decision is a pure function of its inputs so the whole matrix can be
 * tested without constructing a framework request.
 */

export type OriginSignals = {
  /** `Sec-Fetch-Site`, or null where the browser does not send it. */
  readonly secFetchSite: string | null;
  readonly origin: string | null;
  readonly referer: string | null;
  /**
   * The origin this deployment answers on, taken from the resolved request URL
   * so it already reflects whatever `Host`/forwarded headers the platform
   * trusts. This is deliberately not a proxy-trust framework: if a reverse
   * proxy rewrites the origin, Next must be configured to see it — the same
   * requirement redirects and absolute URLs already have.
   */
  readonly expectedOrigin: string;
};

export type OriginPolicy = {
  /**
   * Whether at least one origin signal must be present.
   *
   * `false` (mutations): a request carrying none is allowed. Same-origin
   * `fetch` legitimately omits `Origin` and `Referer` in some browsers, and a
   * caller with no Fetch Metadata at all is not the CSRF threat model, which
   * needs a browser that carries cookies.
   *
   * `true` (credential refresh): a request carrying none is **refused**. That
   * endpoint rotates authentication from a top-level GET, so it fails closed
   * rather than trusting an absence to mean "not a browser". It does not need
   * to serve arbitrary non-browser callers.
   */
  readonly requireOriginSignal: boolean;
};

const MUTATION_POLICY: OriginPolicy = { requireOriginSignal: false };
const REFRESH_POLICY: OriginPolicy = { requireOriginSignal: true };

/** scheme + host + port, so http:// and https:// never compare equal. */
function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function isSameOriginRequest(
  signals: OriginSignals,
  policy: OriginPolicy = MUTATION_POLICY,
): boolean {
  const expected = normalizeOrigin(signals.expectedOrigin);
  if (!expected) return false;

  const site = signals.secFetchSite?.toLowerCase() ?? null;

  if (site === "cross-site") return false;
  // A sibling subdomain is same-*site* but a different origin, and this
  // boundary is about origins.
  if (site === "same-site") return false;
  // An unrecognised value is refused rather than guessed at.
  if (site !== null && site !== "same-origin" && site !== "none") return false;

  // Whatever Fetch Metadata said, a present Origin must agree exactly.
  if (signals.origin !== null) {
    return normalizeOrigin(signals.origin) === expected;
  }
  if (signals.referer !== null) {
    return normalizeOrigin(signals.referer) === expected;
  }

  // Nothing but Fetch Metadata to go on. `same-origin` is our own page;
  // `none` is the address bar or a bookmark, which a page cannot cause.
  if (site !== null) return true;

  // No signal of any kind. Mutations tolerate this; credential refresh does not.
  return !policy.requireOriginSignal;
}

/** For POSTs that change session state: login, logout, password reset. */
export function isSameOrigin(request: NextRequest): boolean {
  return isSameOriginRequest(signalsOf(request), MUTATION_POLICY);
}

/**
 * For `GET /api/auth/refresh`, which rotates credentials and is therefore held
 * to the stricter policy: at least one trustworthy browser-origin signal.
 */
export function isSafeRefreshNavigation(request: NextRequest): boolean {
  return isSameOriginRequest(signalsOf(request), REFRESH_POLICY);
}

function signalsOf(request: NextRequest): OriginSignals {
  return {
    secFetchSite: request.headers.get("sec-fetch-site"),
    origin: request.headers.get("origin"),
    referer: request.headers.get("referer"),
    expectedOrigin: request.nextUrl.origin,
  };
}
