import "server-only";

import { cookies } from "next/headers";

import { COOKIE_NAMES, backendBaseUrl } from "./authConfig";

/**
 * Authenticated requests against the Spring backend, for product modules.
 *
 * Deliberately **not** a proxy. The browser cannot reach this, cannot choose a
 * path and never learns that a token exists — a route that accepted an arbitrary
 * backend URL would undo the whole BFF boundary. Callers pass a fixed path from
 * their own typed loader or Server Action.
 *
 * Failures are returned, not thrown. A page renders several independent sections
 * and a form has to survive a rejected submission, so callers decide locally what
 * a failure means.
 */

export class BackendRequestError extends Error {
  constructor(
    readonly status: number,
    /** True when the session is no longer usable and recovery is the answer. */
    readonly unauthenticated: boolean,
    /**
     * The backend's own controlled sentence, when it passed the checks in
     * {@link safeBackendMessage}. Null whenever there is any doubt.
     */
    readonly detail: string | null = null,
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
 * The most a backend error message is allowed to be.
 *
 * Spring's envelope carries `timestamp`, `status`, `error`, `message` and
 * `path`. Only `message` is a sentence written for a person, and even that is
 * accepted only when it looks like one: bounded, single-line, and free of
 * anything that would describe infrastructure rather than the problem.
 *
 * A rejected message is not a failure to report — the caller falls back to its
 * own wording, which is always safe.
 */
const MAX_DETAIL_LENGTH = 300;

const LEAKY = /https?:\/\/|\/api\/|Exception|\bat [\w.$]+\(|Bearer /i;

export function safeBackendMessage(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;

  const message = (body as Record<string, unknown>).message;
  if (typeof message !== "string") return null;

  const trimmed = message.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_DETAIL_LENGTH) return null;
  if (/[\r\n]/.test(trimmed)) return null;
  if (LEAKY.test(trimmed)) return null;

  return trimmed;
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
): Promise<BackendRequestOutcome<T>> {
  const accessToken = (await cookies()).get(COOKIE_NAMES.access)?.value;
  if (!accessToken) {
    return { ok: false, error: new BackendRequestError(401, true) };
  }

  let response: Response;
  try {
    response = await fetch(`${backendBaseUrl()}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      // Never cached: this is per-user data behind a per-user credential.
      cache: "no-store",
    });
  } catch {
    // Caught without inspecting — the thrown value can carry the request, and
    // the request carries the Authorization header.
    return { ok: false, error: new BackendRequestError(0, false) };
  }

  if (response.ok) {
    // 204 is a real success with nothing to parse.
    if (response.status === 204) return { ok: true, value: undefined as T };

    const text = await response.text();
    return { ok: true, value: (text ? JSON.parse(text) : undefined) as T };
  }

  let detail: string | null = null;
  try {
    detail = safeBackendMessage(await response.json());
  } catch {
    // A body that is not JSON tells the user nothing; the caller's own wording
    // is used instead.
  }

  // A 401 here means the access token expired mid-request. Recovery belongs to
  // the single refresh architecture in the proxy and the refresh route; this
  // must never grow a second one.
  return {
    ok: false,
    error: new BackendRequestError(response.status, response.status === 401, detail),
  };
}

/**
 * @param path a backend path owned by the calling module, never user input
 */
export function backendGet<T>(path: string): Promise<BackendRequestOutcome<T>> {
  return request<T>("GET", path);
}

export function backendPost<T>(path: string, body: unknown): Promise<BackendRequestOutcome<T>> {
  return request<T>("POST", path, body);
}

export function backendPatch<T>(path: string, body: unknown): Promise<BackendRequestOutcome<T>> {
  return request<T>("PATCH", path, body);
}

export function backendPut<T>(path: string, body: unknown): Promise<BackendRequestOutcome<T>> {
  return request<T>("PUT", path, body);
}

export function backendDelete(path: string): Promise<BackendRequestOutcome<void>> {
  return request<void>("DELETE", path);
}
