import "server-only";

import { createHash } from "node:crypto";

import { REFRESH_GRACE_WINDOW_MS } from "./authConfig";
import { refresh as refreshOnBackend, type BackendResult, type BackendTokenPair } from "./backendAuth";

/**
 * Deduplicates refreshes that share the same old refresh token.
 *
 * This exists because rotation makes a duplicate refresh actively dangerous, not
 * merely wasteful. The backend marks the old token used and issues a new one; if
 * a second request presents the same old token, reuse detection fires and the
 * **whole session is revoked**. Two tabs waking at once would sign the user out.
 *
 * So the first caller performs the refresh and everyone arriving with the same
 * old token receives the same result — including callers that arrive slightly
 * *after* it resolved, still carrying the old cookie because their request was
 * already in flight when the new one was set. That late window is why the entry
 * is held for a short period instead of being dropped the moment it settles.
 *
 * Keyed by a SHA-256 digest rather than the token itself, so the raw credential
 * is never a map key, never enumerable from a heap dump by inspection, and never
 * logged. Neither the token nor the digest is written anywhere.
 *
 * **Limitation, stated plainly:** this is an in-process map. It prevents
 * duplicate refreshes within one Next.js process, not across several. A
 * multi-instance deployment would need a shared lock; adding one now would mean
 * introducing distributed infrastructure this repository does not have, for a
 * race that a sticky single-process deployment does not hit.
 */

type Entry = {
  readonly promise: Promise<BackendResult<BackendTokenPair>>;
  /** Cleared when the grace window elapses. */
  timer: ReturnType<typeof setTimeout> | null;
};

const inFlight = new Map<string, Entry>();

function digest(refreshToken: string): string {
  return createHash("sha256").update(refreshToken).digest("hex");
}

export type SingleFlightOptions = {
  /** Injectable so tests do not have to wait in real time. */
  readonly graceWindowMs?: number;
  /** Injectable so tests can count backend calls without a network. */
  readonly performRefresh?: (token: string) => Promise<BackendResult<BackendTokenPair>>;
};

export async function refreshOnce(
  refreshToken: string,
  options: SingleFlightOptions = {},
): Promise<BackendResult<BackendTokenPair>> {
  const graceWindowMs = options.graceWindowMs ?? REFRESH_GRACE_WINDOW_MS;
  const perform = options.performRefresh ?? refreshOnBackend;
  const key = digest(refreshToken);

  const existing = inFlight.get(key);
  if (existing) return existing.promise;

  const promise = perform(refreshToken).then((result) => {
    if (result.ok) {
      // Hold the successful pair briefly for stragglers still presenting the old
      // cookie. A failure is not retained: the session is gone, and every caller
      // should learn that immediately rather than from a cached rejection.
      const entry = inFlight.get(key);
      if (entry) {
        entry.timer = setTimeout(() => inFlight.delete(key), graceWindowMs);
        // Do not keep the process alive purely to expire a cache entry.
        entry.timer.unref?.();
      }
    } else {
      inFlight.delete(key);
    }
    return result;
  });

  inFlight.set(key, { promise, timer: null });
  return promise;
}

/** Test seam: drops every entry and its pending timer. */
export function resetRefreshSingleFlight(): void {
  for (const entry of inFlight.values()) {
    if (entry.timer) clearTimeout(entry.timer);
  }
  inFlight.clear();
}
