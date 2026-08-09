import { describe, expect, it } from "vitest";

import type { StaffingProjectContext, TeamRoleRequirement } from "../model/teamFinderData";

import { openingLabel, proposableRequirements, requirementOpenings } from "./openRequirements";

/**
 * Which roles a project still wants, and how many people each still needs.
 *
 * The counts are people, not role types. A role wanting three with one filled is
 * two short, and the same person cannot cover the same requirement twice however
 * their allocation snapshot was recorded.
 */

function requirement(
  teamRoleId: string,
  requiredMembers: number,
  active = true,
): TeamRoleRequirement {
  return {
    requirementId: `req-${teamRoleId}`,
    teamRole: { teamRoleId, name: teamRoleId, active },
    requiredMembers,
  };
}

function member(allocationId: string, ...roleIds: string[]) {
  return {
    allocationId,
    employee: { userId: `u-${allocationId}`, name: allocationId, email: `${allocationId}@x.test` },
    roles: roleIds.map((teamRoleId) => ({ teamRoleId })),
  };
}

function context(
  requirements: readonly TeamRoleRequirement[],
  members: readonly ReturnType<typeof member>[],
): Pick<StaffingProjectContext, "teamRoleRequirements" | "activeMembers"> {
  return { teamRoleRequirements: requirements, activeMembers: members };
}

describe("requirementOpenings", () => {
  it("counts every missing person, not the role once", () => {
    const [opening] = requirementOpenings(
      context([requirement("backend", 4)], [member("a1", "backend")]),
    );

    expect(opening).toMatchObject({ filled: 1, open: 3 });
  });

  it("reports nothing open for a filled role", () => {
    const [opening] = requirementOpenings(
      context([requirement("backend", 2)], [member("a1", "backend"), member("a2", "backend")]),
    );

    expect(opening).toMatchObject({ filled: 2, open: 0 });
  });

  it("never produces a negative gap for an over-filled role", () => {
    const [opening] = requirementOpenings(
      context(
        [requirement("backend", 1)],
        [member("a1", "backend"), member("a2", "backend"), member("a3", "backend")],
      ),
    );

    expect(opening).toMatchObject({ filled: 3, open: 0 });
  });

  it("counts a person once for a role their snapshot lists twice", () => {
    const [opening] = requirementOpenings(
      context([requirement("backend", 2)], [member("a1", "backend", "backend")]),
    );

    expect(opening).toMatchObject({ filled: 1, open: 1 });
  });

  it("lets one person count once in each of two different roles", () => {
    const openings = requirementOpenings(
      context(
        [requirement("backend", 1), requirement("lead", 1)],
        [member("a1", "backend", "lead")],
      ),
    );

    expect(openings.map((opening) => opening.filled)).toEqual([1, 1]);
    expect(openings.map((opening) => opening.open)).toEqual([0, 0]);
  });

  it("ignores people whose roles the requirement did not ask for", () => {
    const [opening] = requirementOpenings(
      context([requirement("backend", 1)], [member("a1", "qa")]),
    );

    expect(opening).toMatchObject({ filled: 0, open: 1 });
  });
});

describe("proposableRequirements", () => {
  it("offers only active roles that still want people", () => {
    // The fixture the proposal form has to get right: one short and active, one
    // filled, one inactive.
    const openings = proposableRequirements(
      context(
        [
          requirement("backend", 3),
          requirement("qa", 1),
          requirement("legacy", 1, false),
        ],
        [member("a1", "backend"), member("a2", "qa")],
      ),
    );

    expect(openings.map((opening) => opening.requirement.teamRole.teamRoleId)).toEqual([
      "backend",
    ]);
    expect(openings[0]).toMatchObject({ filled: 1, open: 2 });
  });

  it("never offers an inactive role, even one nobody has filled", () => {
    // The backend refuses inactive roles on a new proposal, so offering one
    // would only produce a rejection the person could not have predicted.
    const openings = proposableRequirements(
      context([requirement("legacy", 2, false)], []),
    );

    expect(openings).toEqual([]);
  });

  it("offers nothing when every active requirement is filled", () => {
    expect(
      proposableRequirements(
        context([requirement("backend", 1)], [member("a1", "backend")]),
      ),
    ).toEqual([]);
  });
});

describe("openingLabel", () => {
  it("shows both numbers together", () => {
    const [opening] = requirementOpenings(
      context([requirement("backend", 3)], [member("a1", "backend")]),
    );

    expect(openingLabel(opening!)).toBe("1 / 3 filled");
  });
});
