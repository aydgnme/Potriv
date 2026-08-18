import type { DetailsMember, MemberRole } from "../model/projectDetail";

/**
 * How many people a project's role requirement has, and how many it still wants.
 *
 * `filled` counts **distinct active members** whose recorded roles include the
 * requirement's role. Two consequences follow, and both are deliberate:
 *
 * - One person can satisfy two *different* requirements. The backend records the
 *   roles an allocation carries; there is no one-role-per-person rule to invent.
 * - One person cannot satisfy the *same* requirement twice, however many times
 *   the role appears on their allocation snapshot.
 *
 * `open` is clamped: an over-filled role is not a negative gap, and must not
 * offset a genuine shortage elsewhere. This is a count of people, not a score,
 * and not a count of understaffed role types.
 */
export type RequirementFill = {
  readonly required: number;
  readonly filled: number;
  readonly open: number;
};

export function requirementFill(
  teamRoleId: string,
  requiredMembers: number,
  activeMembers: readonly Pick<DetailsMember, "roles">[],
): RequirementFill {
  const filled = activeMembers.filter((member) =>
    member.roles.some((role) => role.teamRoleId === teamRoleId),
  ).length;

  return { required: requiredMembers, filled, open: Math.max(0, requiredMembers - filled) };
}

/** "1 / 3 filled" — the two numbers together, so neither is read alone. */
export function fillLabel(fill: RequirementFill): string {
  return `${fill.filled} / ${fill.required} filled`;
}

/** What is left to do about it, in people. */
export function openLabel(fill: RequirementFill): string {
  if (fill.open === 0) return "Fully staffed";
  if (fill.open === 1) return "1 position open";
  return `${fill.open} positions open`;
}

/** The project's total shortfall, summed the same clamped way. */
export function totalOpenPositions(
  requirements: readonly { readonly teamRole: MemberRole; readonly requiredMembers: number }[],
  activeMembers: readonly Pick<DetailsMember, "roles">[],
): number {
  return requirements.reduce(
    (total, requirement) =>
      total +
      requirementFill(requirement.teamRole.teamRoleId, requirement.requiredMembers, activeMembers)
        .open,
    0,
  );
}

/**
 * A requirement's staffing, with proposals counted separately.
 *
 * `proposed` is deliberately its own number and deliberately does **not** reduce
 * `open`. A proposal is not an allocation: nobody is on the project until a
 * department manager accepts it, so a role needing three people with two
 * proposed still has three positions to fill. Subtracting proposals would tell a
 * manager the work is nearly done on the strength of decisions other people have
 * not made yet.
 *
 * `proposed` is `null` when the team read did not answer — never `0`, which
 * would state that no one has been put forward.
 */
export type RequirementCoverage = {
  readonly required: number;
  readonly active: number;
  readonly proposed: number | null;
  readonly open: number;
};

export function requirementCoverage(
  teamRoleId: string,
  requiredMembers: number,
  activeMembers: readonly Pick<DetailsMember, "roles">[],
  proposedMembers: readonly Pick<DetailsMember, "roles">[] | null,
): RequirementCoverage {
  const active = countHoldingRole(teamRoleId, activeMembers);

  return {
    required: requiredMembers,
    active,
    proposed: proposedMembers === null ? null : countHoldingRole(teamRoleId, proposedMembers),
    // Clamped, for the same reason as `requirementFill`: an over-filled role is
    // not a negative gap and must not offset a real shortage elsewhere.
    open: Math.max(0, requiredMembers - active),
  };
}

/**
 * Distinct people whose recorded roles include this one.
 *
 * Counted per person rather than per role entry, so one allocation carrying the
 * same role twice still counts once — while one person genuinely can satisfy two
 * *different* requirements, which the backend permits and this does not prevent.
 */
function countHoldingRole(
  teamRoleId: string,
  members: readonly Pick<DetailsMember, "roles">[],
): number {
  return members.filter((member) => member.roles.some((role) => role.teamRoleId === teamRoleId))
    .length;
}
