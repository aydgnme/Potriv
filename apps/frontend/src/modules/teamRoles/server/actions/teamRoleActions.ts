"use server";

import { revalidatePath } from "next/cache";

import { resolveProductSession } from "@/modules/auth/server/productSession";

import type { TeamRoleActionState } from "../../model/teamRoleActionState";
import { validateTeamRoleForm } from "../../model/teamRoleForm";
import {
  createTeamRole,
  deactivateTeamRole,
  getTeamRole,
  updateTeamRole,
} from "../teamRoleDataSources";

/**
 * Administering the organization's staffing vocabulary.
 *
 * Organization-admin work, so every action proves that first and reads nothing
 * until it has. Project managers can read the catalogue — they need it to author
 * role requirements — but reading it is not administering it, and none of these
 * are reachable without the admin role.
 *
 * Nothing here touches access roles. A team role says what a project needs
 * staffed; it grants nobody permission to do anything, and this module has no
 * call that could change what somebody may do.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FALLBACK = {
  FORBIDDEN: "You do not have permission to manage team roles.",
  // One sentence for missing and for another organization's.
  NOT_FOUND: "This team role does not exist or is not visible to you.",
  CONFLICT: "That change conflicts with the current state. Refresh and try again.",
  VALIDATION: "That team role was not accepted.",
  UNAUTHENTICATED: "Your session has expired. Sign in again to continue.",
  SERVER: "Something went wrong. Try again.",
} as const;

function messageFor(status: number, detail: string | null): string {
  if (detail !== null) return detail;
  if (status === 400 || status === 422) return FALLBACK.VALIDATION;
  if (status === 401) return FALLBACK.UNAUTHENTICATED;
  if (status === 403) return FALLBACK.FORBIDDEN;
  if (status === 404) return FALLBACK.NOT_FOUND;
  if (status === 409) return FALLBACK.CONFLICT;
  return FALLBACK.SERVER;
}

async function requireOrganizationAdmin(): Promise<boolean> {
  const session = await resolveProductSession();
  return session.authenticated && session.user.roles.includes("ORGANIZATION_ADMIN");
}

/**
 * Where a team-role change matters.
 *
 * Projects read the catalogue when authoring requirements, so their pages are
 * told to re-read. Nothing about an existing requirement changes — a deactivated
 * role stays attached to the projects that already need it.
 */
function refreshTeamRoles(teamRoleId?: string): void {
  revalidatePath("/organization");
  revalidatePath("/organization/team-roles");
  if (teamRoleId) revalidatePath(`/organization/team-roles/${teamRoleId}`);
  revalidatePath("/projects");
}

export async function createTeamRoleAction(
  _previous: TeamRoleActionState,
  formData: FormData,
): Promise<TeamRoleActionState> {
  if (!(await requireOrganizationAdmin())) return { error: FALLBACK.FORBIDDEN };

  const name = typeof formData.get("name") === "string" ? String(formData.get("name")) : "";
  const description =
    typeof formData.get("description") === "string" ? String(formData.get("description")) : "";

  const validated = validateTeamRoleForm(name, description);
  if (!validated.ok) return { fieldErrors: validated.errors, name, description };

  const created = await createTeamRole(validated.values.name, validated.values.description);
  if (!created.ok) {
    // A duplicate is the common case; the entered values are kept so the form can
    // be corrected rather than retyped.
    return { error: messageFor(created.status, created.detail), name, description };
  }

  refreshTeamRoles(created.value.teamRoleId);

  return { done: `${created.value.name} was created.` };
}

export async function updateTeamRoleAction(
  _previous: TeamRoleActionState,
  formData: FormData,
): Promise<TeamRoleActionState> {
  if (!(await requireOrganizationAdmin())) return { error: FALLBACK.FORBIDDEN };

  const teamRoleId = formData.get("teamRoleId");
  if (typeof teamRoleId !== "string" || !UUID.test(teamRoleId)) {
    return { error: FALLBACK.NOT_FOUND };
  }

  const name = typeof formData.get("name") === "string" ? String(formData.get("name")) : "";
  const description =
    typeof formData.get("description") === "string" ? String(formData.get("description")) : "";

  const validated = validateTeamRoleForm(name, description);
  if (!validated.ok) return { fieldErrors: validated.errors, name, description };

  // Only the two editable fields; the state is changed by its own actions, so an
  // edit can never silently reactivate something.
  const updated = await updateTeamRole(teamRoleId, {
    name: validated.values.name,
    description: validated.values.description,
  });
  if (!updated.ok) {
    return { error: messageFor(updated.status, updated.detail), name, description };
  }

  refreshTeamRoles(teamRoleId);

  return { done: `${updated.value.name} was updated.` };
}

/**
 * Retiring a team role.
 *
 * Soft: the row stays resolvable and every project that already requires it keeps
 * requiring it. What changes is that it is no longer offered for new work.
 */
export async function deactivateTeamRoleAction(
  _previous: TeamRoleActionState,
  formData: FormData,
): Promise<TeamRoleActionState> {
  if (!(await requireOrganizationAdmin())) return { error: FALLBACK.FORBIDDEN };

  const teamRoleId = formData.get("teamRoleId");
  if (typeof teamRoleId !== "string" || !UUID.test(teamRoleId)) {
    return { error: FALLBACK.NOT_FOUND };
  }

  const fresh = await getTeamRole(teamRoleId);
  if (!fresh.ok) {
    return { error: fresh.reason === "ERROR" ? FALLBACK.SERVER : FALLBACK.NOT_FOUND };
  }

  const deactivated = await deactivateTeamRole(teamRoleId);
  if (!deactivated.ok) {
    return { error: messageFor(deactivated.status, deactivated.detail) };
  }

  refreshTeamRoles(teamRoleId);

  return {
    done: `${fresh.value.name} is no longer offered for new work. Projects that already require it are unchanged.`,
  };
}

export async function reactivateTeamRoleAction(
  _previous: TeamRoleActionState,
  formData: FormData,
): Promise<TeamRoleActionState> {
  if (!(await requireOrganizationAdmin())) return { error: FALLBACK.FORBIDDEN };

  const teamRoleId = formData.get("teamRoleId");
  if (typeof teamRoleId !== "string" || !UUID.test(teamRoleId)) {
    return { error: FALLBACK.NOT_FOUND };
  }

  // Only the flag: a reactivation must not carry a name or description along and
  // quietly rewrite them.
  const reactivated = await updateTeamRole(teamRoleId, { active: true });
  if (!reactivated.ok) {
    return { error: messageFor(reactivated.status, reactivated.detail) };
  }

  refreshTeamRoles(teamRoleId);

  return { done: `${reactivated.value.name} is available again.` };
}
