import { describe, expect, it } from "vitest";

import type { DetailsMember, MemberRole } from "../model/projectDetail";

import { fillLabel, openLabel, requirementFill, totalOpenPositions } from "./requirementFill";

/**
 * What a project manager reads next to each role: how many of the people it asked
 * for are actually there.
 *
 * The cases with `required > 1` are the ones that matter. Counting understaffed
 * role *types* instead — the bug FE-03A fixed — would report a role needing three
 * people with one filled as a shortage of one rather than two.
 */

const BACKEND = "role-backend";
const LEAD = "role-lead";
const QA = "role-qa";

function role(teamRoleId: string, active = true): MemberRole {
  return { teamRoleId, name: teamRoleId, active };
}

function member(...roleIds: string[]): Pick<DetailsMember, "roles"> {
  return { roles: roleIds.map((id) => role(id)) };
}

describe("requirementFill", () => {
  it("reports one of three filled and two open", () => {
    expect(requirementFill(BACKEND, 3, [member(BACKEND)])).toEqual({
      required: 3,
      filled: 1,
      open: 2,
    });
  });

  it("reports a fully staffed role as having nothing open", () => {
    expect(requirementFill(BACKEND, 2, [member(BACKEND), member(BACKEND)])).toEqual({
      required: 2,
      filled: 2,
      open: 0,
    });
  });

  it("never turns an over-filled role into a negative gap", () => {
    // Three people on a role that wanted one is not "minus two positions".
    expect(
      requirementFill(BACKEND, 1, [member(BACKEND), member(BACKEND), member(BACKEND)]),
    ).toEqual({ required: 1, filled: 3, open: 0 });
  });

  it("lets one person count towards two different requirements", () => {
    // The backend records the roles an allocation carries; there is no
    // one-role-per-person rule to invent.
    const team = [member(BACKEND, LEAD)];

    expect(requirementFill(BACKEND, 1, team).filled).toBe(1);
    expect(requirementFill(LEAD, 1, team).filled).toBe(1);
  });

  it("counts a person once for a role their snapshot lists twice", () => {
    // One person is one person, however the roles were recorded.
    expect(requirementFill(BACKEND, 2, [member(BACKEND, BACKEND)])).toEqual({
      required: 2,
      filled: 1,
      open: 1,
    });
  });

  it("ignores people whose roles the requirement did not ask for", () => {
    expect(requirementFill(BACKEND, 1, [member(QA)])).toEqual({
      required: 1,
      filled: 0,
      open: 1,
    });
  });

  it("reports everything open when nobody is allocated", () => {
    expect(requirementFill(BACKEND, 4, [])).toEqual({ required: 4, filled: 0, open: 4 });
  });
});

describe("totalOpenPositions", () => {
  it("sums the clamped shortfalls, so over-fill cannot hide a shortage", () => {
    // Backend 1 required / 3 filled → 0, Lead 3 required / 1 filled → 2.
    const requirements = [
      { teamRole: role(BACKEND), requiredMembers: 1 },
      { teamRole: role(LEAD), requiredMembers: 3 },
    ];
    const team = [member(BACKEND), member(BACKEND), member(BACKEND, LEAD)];

    expect(totalOpenPositions(requirements, team)).toBe(2);
  });

  it("is zero when nothing is required", () => {
    expect(totalOpenPositions([], [member(BACKEND)])).toBe(0);
  });
});

describe("labels", () => {
  it("shows both numbers together, so neither is read alone", () => {
    expect(fillLabel({ required: 3, filled: 1, open: 2 })).toBe("1 / 3 filled");
  });

  it("counts positions in people, singular and plural", () => {
    expect(openLabel({ required: 3, filled: 1, open: 2 })).toBe("2 positions open");
    expect(openLabel({ required: 2, filled: 1, open: 1 })).toBe("1 position open");
    expect(openLabel({ required: 2, filled: 2, open: 0 })).toBe("Fully staffed");
  });

  it("says positions rather than roles, because that is what is counted", () => {
    expect(openLabel({ required: 4, filled: 1, open: 3 })).not.toContain("role");
  });
});
