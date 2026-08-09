import type { StaffingProjectContext, TeamRoleRequirement } from "../model/teamFinderData";

/**
 * Which of a project's role requirements still want people, and how many.
 *
 * ```
 * filled = distinct active members whose role snapshot includes this teamRoleId
 * open   = max(0, requiredMembers - filled)
 * ```
 *
 * One person counts once for a requirement however many times their snapshot
 * lists the role, and may count once in each of two *different* requirements —
 * the backend records the roles an allocation carries, not a one-role-per-person
 * rule. Over-filling never produces a negative gap.
 *
 * Projects computes the same figure for its own screens. This copy is
 * deliberate: modules do not import each other, and both are pinned by their own
 * regression tests, so a divergence fails a test rather than reaching a screen.
 */
export type RequirementOpening = {
  readonly requirement: TeamRoleRequirement;
  readonly filled: number;
  readonly open: number;
};

export function requirementOpenings(
  context: Pick<StaffingProjectContext, "teamRoleRequirements" | "activeMembers">,
): readonly RequirementOpening[] {
  return context.teamRoleRequirements.map((requirement) => {
    const filled = context.activeMembers.filter((member) =>
      member.roles.some((role) => role.teamRoleId === requirement.teamRole.teamRoleId),
    ).length;

    return {
      requirement,
      filled,
      open: Math.max(0, requirement.requiredMembers - filled),
    };
  });
}

/**
 * The roles a new proposal may name.
 *
 * Active and still short of people. An inactive role stays visible elsewhere as
 * context — a project may legitimately still require one — but the backend
 * refuses it on a new proposal, so it is never offered here.
 */
export function proposableRequirements(
  context: Pick<StaffingProjectContext, "teamRoleRequirements" | "activeMembers">,
): readonly RequirementOpening[] {
  return requirementOpenings(context).filter(
    (opening) => opening.requirement.teamRole.active && opening.open > 0,
  );
}

/** "1 / 3 filled" — both numbers together, so neither is read alone. */
export function openingLabel(opening: RequirementOpening): string {
  return `${opening.filled} / ${opening.requirement.requiredMembers} filled`;
}
