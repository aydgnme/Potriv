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
