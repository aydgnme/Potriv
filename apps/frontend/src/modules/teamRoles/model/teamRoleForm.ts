/**
 * What a team role has to be before it is worth sending.
 *
 * The backend trims the name and compares uniqueness on a lowercased form, so the
 * trim is reproduced here and the case deliberately is not — "Backend Engineer"
 * and "backend engineer" collide, but whichever was typed is the one displayed.
 *
 * A blank description becomes `null` rather than an empty string, matching what
 * the backend stores; an empty string would render as a description that exists
 * and says nothing.
 *
 * Uniqueness itself is never predicted. Only the organization's whole set could
 * answer it, that set changes, and the backend answers 409.
 */

export const TEAM_ROLE_NAME_MAX = 120;
export const TEAM_ROLE_DESCRIPTION_MAX = 1000;

export type TeamRoleFormErrors = {
  readonly name?: string;
  readonly description?: string;
};

export type TeamRoleFormValues = {
  readonly name: string;
  readonly description: string | null;
};

export type TeamRoleFormResult =
  | { readonly ok: true; readonly values: TeamRoleFormValues }
  | { readonly ok: false; readonly errors: TeamRoleFormErrors };

export function validateTeamRoleForm(
  rawName: string,
  rawDescription: string,
): TeamRoleFormResult {
  const name = rawName.trim();
  const description = rawDescription.trim();
  const errors: { name?: string; description?: string } = {};

  if (name.length === 0) {
    errors.name = "Enter a team role name.";
  } else if (name.length > TEAM_ROLE_NAME_MAX) {
    errors.name = `Use ${TEAM_ROLE_NAME_MAX} characters or fewer.`;
  }

  if (description.length > TEAM_ROLE_DESCRIPTION_MAX) {
    errors.description = `Use ${TEAM_ROLE_DESCRIPTION_MAX} characters or fewer.`;
  }

  if (errors.name !== undefined || errors.description !== undefined) {
    return { ok: false, errors };
  }

  return { ok: true, values: { name, description: description === "" ? null : description } };
}
