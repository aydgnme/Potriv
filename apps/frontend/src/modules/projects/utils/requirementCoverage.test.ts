import { describe, expect, it } from "vitest";

import { requirementCoverage } from "./requirementFill";

/**
 * Requirement coverage.
 *
 * One rule dominates every test here: a proposal is not an allocation. The
 * `proposed` column exists so a manager can see people are waiting on a
 * decision, and it must never make the shortfall look smaller than it is.
 */

const holding = (...teamRoleIds: readonly string[]) => ({
  roles: teamRoleIds.map((teamRoleId) => ({ teamRoleId, name: teamRoleId, active: true })),
});

describe("open positions", () => {
  it("is what is left after active allocations, and nothing else", () => {
    expect(requirementCoverage("backend", 3, [holding("backend")], [])).toEqual({
      required: 3,
      active: 1,
      proposed: 0,
      open: 2,
    });
  });

  it("does not shrink because people have been proposed", () => {
    const coverage = requirementCoverage("backend", 3, [], [
      holding("backend"),
      holding("backend"),
    ]);

    // Two proposals standing, nobody allocated: still three positions to fill,
    // because no department manager has said yes to any of them.
    expect(coverage.proposed).toBe(2);
    expect(coverage.open).toBe(3);
  });

  it("never reports a negative gap for an over-filled role", () => {
    const coverage = requirementCoverage(
      "backend",
      1,
      [holding("backend"), holding("backend"), holding("backend")],
      [],
    );

    expect(coverage.active).toBe(3);
    // Clamped: a surplus here must not offset a real shortage on another role.
    expect(coverage.open).toBe(0);
  });
});

describe("counting people", () => {
  it("counts one person once however many times the role appears on them", () => {
    expect(requirementCoverage("backend", 2, [holding("backend", "backend")], []).active).toBe(1);
  });

  it("lets one person satisfy two different requirements", () => {
    const member = [holding("backend", "lead")];

    expect(requirementCoverage("backend", 1, member, []).open).toBe(0);
    expect(requirementCoverage("lead", 1, member, []).open).toBe(0);
  });

  it("ignores people holding some other role entirely", () => {
    expect(requirementCoverage("backend", 1, [holding("qa")], [holding("qa")])).toEqual({
      required: 1,
      active: 0,
      proposed: 0,
      open: 1,
    });
  });
});

describe("when proposals could not be read", () => {
  it("reports null rather than zero", () => {
    // Zero would state that nobody has been put forward. Null says nobody asked.
    expect(requirementCoverage("backend", 2, [], null).proposed).toBeNull();
  });

  it("still answers everything the details read could answer", () => {
    const coverage = requirementCoverage("backend", 2, [holding("backend")], null);

    expect(coverage.required).toBe(2);
    expect(coverage.active).toBe(1);
    expect(coverage.open).toBe(1);
  });
});
