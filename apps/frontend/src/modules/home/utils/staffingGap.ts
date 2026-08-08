import type { ProjectStaffingDetails } from "../model/homeData";

/**
 * How many declared team roles are still short of people.
 *
 * Every operand comes from `GET /projects/{id}/details`: `teamRoleRequirements`
 * says how many the project asked for, and `activeMembers[].roles` says who
 * actually holds each one. A role counts as still needed when fewer active
 * members hold it than were required.
 *
 * Deliberately **not** a score. Team Finder has a scoring model with its own
 * meaning, and reusing that language here would suggest the two numbers are
 * comparable. This is a count of unmet requirements and nothing else.
 *
 * A member filling two required roles counts toward both, which is what the
 * data says: the backend records the roles an allocation carries, not a
 * one-role-per-person rule.
 */
export function rolesStillNeeded(details: ProjectStaffingDetails): number {
  let unmet = 0;

  for (const requirement of details.teamRoleRequirements) {
    const filled = details.activeMembers.filter((member) =>
      member.roles.some((role) => role.teamRoleId === requirement.teamRole.teamRoleId),
    ).length;

    if (filled < requirement.requiredMembers) unmet += 1;
  }

  return unmet;
}

/**
 * The sentence Home shows for a project's staffing.
 *
 * Null input means the detail was not loaded — Home enriches only a bounded
 * shortlist — and that is said plainly rather than shown as "0 needed", which
 * would read as "fully staffed".
 */
export function staffingLabel(rolesNeeded: number | null): string {
  if (rolesNeeded === null) return "Staffing not checked";
  if (rolesNeeded === 0) return "Team staffed";
  if (rolesNeeded === 1) return "1 role still needed";
  return `${rolesNeeded} roles still needed`;
}
