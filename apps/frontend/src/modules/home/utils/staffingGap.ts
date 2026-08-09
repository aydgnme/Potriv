import type { ProjectStaffingDetails } from "../model/homeData";

/**
 * How many staffing positions on a project are still open.
 *
 * Every operand comes from `GET /projects/{id}/details`: `teamRoleRequirements`
 * says how many people each role asked for, and `activeMembers[].roles` says who
 * actually holds it. The shortfall for a role is `required − filled`, and the
 * project's total is those shortfalls added up.
 *
 * **Positions, not role types.** Counting understaffed roles instead would
 * report a role needing three people with one filled as a shortage of one, when
 * two people are missing — the number a manager acts on is how many people they
 * still have to find.
 *
 * "Position" rather than "employee" because one person can satisfy two different
 * role requirements: the backend records the roles an allocation carries, not a
 * one-role-per-person rule. Two open positions may therefore be closed by one
 * hire, and the wording should not promise otherwise.
 *
 * Deliberately **not** a score. Team Finder has a scoring model with its own
 * meaning, and borrowing that language would suggest the two numbers compare.
 */
export function openStaffingSlots(details: ProjectStaffingDetails): number {
  let openSlots = 0;

  for (const requirement of details.teamRoleRequirements) {
    const filled = details.activeMembers.filter((member) =>
      member.roles.some((role) => role.teamRoleId === requirement.teamRole.teamRoleId),
    ).length;

    // Clamped: an over-filled role has no negative shortage to subtract from
    // the rest of the project.
    openSlots += Math.max(0, requirement.requiredMembers - filled);
  }

  return openSlots;
}

/**
 * The sentence Home shows for a project's staffing.
 *
 * Null means the detail was not loaded — Home enriches only a bounded shortlist
 * — and that is said plainly rather than shown as "0", which would read as a
 * fully staffed team nobody actually checked.
 */
export function staffingLabel(openSlots: number | null): string {
  if (openSlots === null) return "Staffing not checked";
  if (openSlots === 0) return "Team staffed";
  if (openSlots === 1) return "1 position still needed";
  return `${openSlots} positions still needed`;
}
