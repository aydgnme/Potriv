import "server-only";

/**
 * Every constant the product auth boundary depends on, in one place.
 *
 * Each value that mirrors a backend setting says so, because a silent drift
 * between the two is the kind of bug that only shows up as a mysterious logout.
 */

/**
 * The Spring backend, reachable from the Next server only.
 *
 * Deliberately **not** `NEXT_PUBLIC_*`: the browser talks to same-origin BFF
 * routes and must never need to know where the backend lives.
 */
export function backendBaseUrl(): string {
  return process.env.POTRIV_BACKEND_BASE_URL ?? "http://localhost:8080/api";
}

export const COOKIE_NAMES = {
  /** Backend access token. HttpOnly — product JS can never read it. */
  access: "potriv_access_token",
  /** Backend refresh token. HttpOnly. Rotated on every use by the backend. */
  refresh: "potriv_refresh_token",
  /**
   * Display name only. HttpOnly as well, because there is no reason for the
   * browser to read it directly and one less client-readable cookie is one less
   * thing to reason about. Never used for authorization.
   */
  profileName: "potriv_profile_name",
} as const;

/**
 * The access cookie expires slightly before the JWT does, so the browser stops
 * presenting a token the backend is about to reject. The lifetime itself comes
 * from `expiresInSeconds` on the login/refresh response — never hard-coded.
 */
export const ACCESS_COOKIE_SKEW_SECONDS = 30;

/**
 * Mirrors the backend's `refresh-token-days: 7`. The backend decides the real
 * validity; this only decides how long the browser bothers to keep presenting
 * it. Change it here and nowhere else.
 */
export const REFRESH_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/**
 * How long a completed refresh stays deduplicated.
 *
 * Rotation makes this necessary rather than merely nice: once a refresh
 * succeeds the old token is marked used, and a request that arrives a moment
 * later still carrying the old cookie would trip reuse detection and destroy an
 * otherwise healthy session. Holding the result briefly lets that straggler
 * reuse the new pair instead of asking for another.
 *
 * Bounded on purpose — this is a short race window, not a token cache.
 */
export const REFRESH_GRACE_WINDOW_MS = 5_000;

/**
 * Cookies are only marked Secure where the origin is actually HTTPS — a Secure
 * cookie on plain HTTP is simply never sent, which would break local
 * development silently.
 *
 * Named without a `use` prefix on purpose: that prefix is reserved for React
 * hooks, and this is an ordinary server function.
 */
export function secureCookiesEnabled(): boolean {
  return process.env.NODE_ENV === "production";
}
