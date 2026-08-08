import "server-only";

import { cookies } from "next/headers";

import { COOKIE_NAMES, backendBaseUrl } from "./authConfig";

/**
 * Authenticated reads against the Spring backend, for product modules.
 *
 * Deliberately **not** a proxy. The browser cannot reach this, cannot choose a
 * path and never learns that a token exists — a route that accepted an arbitrary
 * backend URL would undo the whole BFF boundary. Callers pass a fixed path from
 * their own typed loader; there is no dynamic origin and no request body,
 * because Home only reads.
 *
 * Failures are returned, not thrown. Home renders several independent sections
 * and one backend hiccup must not blank the others, so callers decide locally
 * what a failure means.
 */

export class BackendRequestError extends Error {
  constructor(
    readonly status: number,
    /** True when the session is no longer usable and recovery is the answer. */
    readonly unauthenticated: boolean,
  ) {
    // No URL, no body, no token — an error message is a place credentials leak.
    super(`Backend request failed with status ${status}`);
    this.name = "BackendRequestError";
  }
}

export type BackendRequestOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: BackendRequestError };

/**
 * @param path a backend path owned by the calling module, never user input
 */
export async function backendGet<T>(path: string): Promise<BackendRequestOutcome<T>> {
  const accessToken = (await cookies()).get(COOKIE_NAMES.access)?.value;
  if (!accessToken) {
    return { ok: false, error: new BackendRequestError(401, true) };
  }

  let response: Response;
  try {
    response = await fetch(`${backendBaseUrl()}${path}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
      // Never cached: this is per-user data behind a per-user credential.
      cache: "no-store",
    });
  } catch {
    // Caught without inspecting — the thrown value can carry the request, and
    // the request carries the Authorization header.
    return { ok: false, error: new BackendRequestError(0, false) };
  }

  if (response.ok) {
    return { ok: true, value: (await response.json()) as T };
  }

  // A 401 here means the access token expired mid-render. Recovery belongs to
  // the single refresh architecture in middleware and the refresh route; this
  // must never grow a second one.
  return {
    ok: false,
    error: new BackendRequestError(response.status, response.status === 401),
  };
}
