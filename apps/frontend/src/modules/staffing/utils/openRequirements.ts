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

/**
 * A requirement's full composition: what was asked for, who holds it, who is
 * only proposed for it, and what is still open.
 *
 * The invariant this type exists to protect:
 *
 * ```
 * open = max(0, needed - active)
 * ```
 *
 * **Proposed is never subtracted.** A proposal is a request a department
 * manager has not answered; nobody is on the project because of one. A role
 * needing three people with one allocated and two proposed still has two
 * positions open, and reporting one would tell a manager the gap is nearly
 * closed on the strength of decisions nobody has made.
 *
 * `proposed` is `null` when the team read did not answer — never `0`, which
 * would state that nobody has been put forward. Unknown is not none.
 */
export type RequirementComposition = {
  readonly requirement: TeamRoleRequirement;
  readonly needed: number;
  readonly active: number;
  readonly proposed: number | null;
  readonly open: number;
};

export function requirementComposition(
  context: Pick<StaffingProjectContext, "teamRoleRequirements" | "activeMembers">,
  proposedMembers: readonly { readonly roles: readonly { readonly teamRoleId: string }[] }[] | null,
): readonly RequirementComposition[] {
  return requirementOpenings(context).map((opening) => {
    const teamRoleId = opening.requirement.teamRole.teamRoleId;

    return {
      requirement: opening.requirement,
      needed: opening.requirement.requiredMembers,
      active: opening.filled,
      proposed:
        proposedMembers === null
          ? null
          : proposedMembers.filter((member) =>
              member.roles.some((role) => role.teamRoleId === teamRoleId),
            ).length,
      // Reuses the opening already computed from active members alone. Written
      // this way so there is exactly one place `open` is derived, and it has no
      // access to the proposal count even by accident.
      open: opening.open,
    };
  });
}
