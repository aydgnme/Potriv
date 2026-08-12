import type { TeamRoleFormErrors } from "./teamRoleForm";

/**
 * What a team-role Server Action hands back.
 *
 * Outside the `"use server"` files, which may only export async functions.
 * Product wording only — no status code, no backend path, no envelope.
 */
export type TeamRoleActionState = {
  readonly error?: string;
  readonly done?: string;
  readonly fieldErrors?: TeamRoleFormErrors;
  /** Echoed back so a rejected form keeps what was typed. */
  readonly name?: string;
  readonly description?: string;
};

export const EMPTY_TEAM_ROLE_STATE: TeamRoleActionState = {};
