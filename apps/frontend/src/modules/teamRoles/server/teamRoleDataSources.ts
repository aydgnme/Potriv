import "server-only";

import {
  backendDelete,
  backendGet,
  backendPatch,
  backendPost,
} from "@/modules/auth/server-public";

import type { TeamRole } from "../model/teamRoleData";

/**
 * Every backend call the Team Roles area makes.
 *
 * The collection read is deliberately wider than the rest: project managers need
 * the catalogue to author role requirements, and they need inactive entries too,
 * because a project whose role was retired afterwards still has to render what is
 * already attached. Everything else — the single read, and all four mutations —
 * is organization-admin only on the backend, and the product surface matches.
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

async function load<T>(path: string): Promise<Loaded<T>> {
  const outcome = await backendGet<T>(path);
  if (outcome.ok) return { ok: true, value: outcome.value };
  return { ok: false, reason: failureFor(outcome.error.status) };
}

export type MutationOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly status: number; readonly detail: string | null };

/** `GET /team-roles` — name ascending; admins and project managers may read it. */
export function getTeamRoles(includeInactive: boolean): Promise<Loaded<readonly TeamRole[]>> {
  const search = new URLSearchParams({ includeInactive: String(includeInactive) });
  return load<readonly TeamRole[]>(`/team-roles?${search.toString()}`);
}

/** `GET /team-roles/{id}` — administration, so organization-admin only. */
export function getTeamRole(teamRoleId: string): Promise<Loaded<TeamRole>> {
  return load<TeamRole>(`/team-roles/${encodeURIComponent(teamRoleId)}`);
}

/** `POST /team-roles` — 201. */
export async function createTeamRole(
  name: string,
  description: string | null,
): Promise<MutationOutcome<TeamRole>> {
  const outcome = await backendPost<TeamRole>("/team-roles", { name, description });
  if (outcome.ok) return { ok: true, value: outcome.value };
  return { ok: false, status: outcome.error.status, detail: outcome.error.detail };
}

/**
 * `PATCH /team-roles/{id}` — partial.
 *
 * Callers pass exactly the fields they mean to change, so a rename never carries
 * a stale `active` and a reactivation never carries a stale name.
 */
export async function updateTeamRole(
  teamRoleId: string,
  changes: { readonly name?: string; readonly description?: string | null; readonly active?: boolean },
): Promise<MutationOutcome<TeamRole>> {
  const outcome = await backendPatch<TeamRole>(
    `/team-roles/${encodeURIComponent(teamRoleId)}`,
    changes,
  );
  if (outcome.ok) return { ok: true, value: outcome.value };
  return { ok: false, status: outcome.error.status, detail: outcome.error.detail };
}

/**
 * `DELETE /team-roles/{id}` — 204, and **soft**.
 *
 * The row stays resolvable so projects that already require the role keep
 * rendering. Nothing in this product deletes a team role outright.
 */
export async function deactivateTeamRole(
  teamRoleId: string,
): Promise<MutationOutcome<void>> {
  const outcome = await backendDelete(`/team-roles/${encodeURIComponent(teamRoleId)}`);
  if (outcome.ok) return { ok: true, value: undefined };
  return { ok: false, status: outcome.error.status, detail: outcome.error.detail };
}
