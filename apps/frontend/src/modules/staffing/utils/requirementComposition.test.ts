import { describe, expect, it } from "vitest";

import { requirementComposition } from "./openRequirements";

/**
 * Team composition arithmetic.
 *
 * These tests exist to fail loudly if anybody ever changes
 *
 *   open = needed - active
 *
 * into
 *
 *   open = needed - active - proposed
 *
 * That single subtraction would tell a manager a gap is nearly closed because
 * of decisions no department manager has made yet. A proposal is a request.
 */

const requirement = (teamRoleId: string, requiredMembers: number, active = true) => ({
  requirementId: `req-${teamRoleId}`,
  teamRole: { teamRoleId, name: teamRoleId, active },
  requiredMembers,
});

const holder = (...teamRoleIds: readonly string[]) => ({
  allocationId: `a-${teamRoleIds.join("-")}`,
  employee: { userId: "u", name: "n", email: "e" },
  roles: teamRoleIds.map((teamRoleId) => ({ teamRoleId })),
});

const proposal = (...teamRoleIds: readonly string[]) => ({
  proposalId: `p-${teamRoleIds.join("-")}`,
  roles: teamRoleIds.map((teamRoleId) => ({ teamRoleId })),
});

describe("open never subtracts proposed", () => {
  it("reports the case the prompt names: needed 3, active 1, proposed 1, open 2", () => {
    const [row] = requirementComposition(
      { teamRoleRequirements: [requirement("backend", 3)], activeMembers: [holder("backend")] },
      [proposal("backend")],
    );

    expect(row).toEqual({
      requirement: requirement("backend", 3),
      needed: 3,
      active: 1,
      proposed: 1,
      // Two, not one. The proposed person is not on the project.
      open: 2,
    });
  });

  it("leaves open untouched however many people are proposed", () => {
    const many = [proposal("backend"), proposal("backend"), proposal("backend"), proposal("backend")];
    const [row] = requirementComposition(
      { teamRoleRequirements: [requirement("backend", 2)], activeMembers: [] },
      many,
    );

    expect(row?.proposed).toBe(4);
    // Four requests standing against two positions closes neither of them.
    expect(row?.open).toBe(2);
  });

  it("closes a position only when somebody is actually allocated", () => {
    const [row] = requirementComposition(
      {
        teamRoleRequirements: [requirement("qa", 1)],
        activeMembers: [holder("qa")],
      },
      [proposal("qa")],
    );

    expect(row?.active).toBe(1);
    expect(row?.open).toBe(0);
  });
});

describe("counting", () => {
  it("counts proposals per role, not per person", () => {
    const [backend, qa] = requirementComposition(
      {
        teamRoleRequirements: [requirement("backend", 2), requirement("qa", 2)],
        activeMembers: [],
      },
      // One proposal naming both roles counts once against each.
      [proposal("backend", "qa")],
    );

    expect(backend?.proposed).toBe(1);
    expect(qa?.proposed).toBe(1);
  });

  it("ignores proposals for a role this requirement does not name", () => {
    const [row] = requirementComposition(
      { teamRoleRequirements: [requirement("backend", 1)], activeMembers: [] },
      [proposal("design")],
    );

    expect(row?.proposed).toBe(0);
    expect(row?.open).toBe(1);
  });

  it("never reports a negative open for an over-filled role", () => {
    const [row] = requirementComposition(
      {
        teamRoleRequirements: [requirement("backend", 1)],
        activeMembers: [holder("backend"), holder("backend"), holder("backend")],
      },
      [],
    );

    expect(row?.active).toBe(3);
    expect(row?.open).toBe(0);
  });
});

describe("when the team read failed", () => {
  it("reports proposed as unknown rather than zero", () => {
    const [row] = requirementComposition(
      { teamRoleRequirements: [requirement("backend", 3)], activeMembers: [holder("backend")] },
      null,
    );

    // Null, not 0. "Nobody checked" and "nobody was proposed" are different
    // facts, and only one of them is true here.
    expect(row?.proposed).toBeNull();
  });

  it("still answers everything the project read could answer", () => {
    const [row] = requirementComposition(
      { teamRoleRequirements: [requirement("backend", 3)], activeMembers: [holder("backend")] },
      null,
    );

    expect(row?.needed).toBe(3);
    expect(row?.active).toBe(1);
    expect(row?.open).toBe(2);
  });
});

describe("retired roles", () => {
  it("still reports a requirement whose role was deactivated", () => {
    const [row] = requirementComposition(
      { teamRoleRequirements: [requirement("legacy", 2, false)], activeMembers: [] },
      [],
    );

    // The project genuinely still asks for it; hiding it would erase a real gap.
    expect(row?.requirement.teamRole.active).toBe(false);
    expect(row?.open).toBe(2);
  });
});
