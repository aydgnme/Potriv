import "server-only";

import { backendGet } from "@/modules/auth/server-public";

import type { AccountSession } from "../model/sessionList";

/**
 * The one read Account performs.
 *
 * `GET /auth/sessions` is self-scoped by the backend — there is no user
 * parameter to pass and none to get wrong. Nothing here fetches per-session
 * detail, because the list response is already the whole contract.
 */

export type LoadFailure = "FORBIDDEN" | "NOT_FOUND" | "ERROR";

export type Loaded<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: LoadFailure };

function failureFor(status: number): LoadFailure {
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  return "ERROR";
}

/** `GET /auth/sessions` — the caller's own sessions, newest first. */
export async function getSessions(): Promise<Loaded<readonly AccountSession[]>> {
  const outcome = await backendGet<readonly AccountSession[]>("/auth/sessions");
  if (outcome.ok) return { ok: true, value: outcome.value };
  return { ok: false, reason: failureFor(outcome.error.status) };
}

export type AccountDataSources = {
  readonly getSessions: typeof getSessions;
};

export const ACCOUNT_DATA_SOURCES: AccountDataSources = { getSessions };
