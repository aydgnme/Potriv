import "server-only";

import type { TeamRole } from "../model/teamRoleData";

import { getTeamRole, getTeamRoles, type Loaded } from "./teamRoleDataSources";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `?includeInactive=true` widens the list; anything else leaves it active-only. */
export function readIncludeInactive(
  params: Record<string, string | readonly string[] | undefined>,
): boolean {
  const raw = params.includeInactive;
  const first = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  return first === "true";
}

export function loadTeamRoles(includeInactive: boolean): Promise<Loaded<readonly TeamRole[]>> {
  return getTeamRoles(includeInactive);
}

export type TeamRoleDetailState =
  | { readonly kind: "ready"; readonly teamRole: TeamRole }
  | { readonly kind: "unavailable" }
  | { readonly kind: "error" };

/**
 * One team role.
 *
 * A malformed id is answered without asking the backend, and 403 and 404 collapse
 * — distinguishing them would confirm which ids exist to anyone willing to try.
 */
export async function loadTeamRoleDetail(teamRoleId: string): Promise<TeamRoleDetailState> {
  if (!UUID.test(teamRoleId)) return { kind: "unavailable" };

  const outcome = await getTeamRole(teamRoleId);
  if (outcome.ok) return { kind: "ready", teamRole: outcome.value };
  if (outcome.reason === "ERROR") return { kind: "error" };
  return { kind: "unavailable" };
}
