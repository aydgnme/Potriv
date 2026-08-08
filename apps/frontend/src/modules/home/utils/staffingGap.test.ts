import { describe, expect, it } from "vitest";

import type { ProjectStaffingDetails } from "../model/homeData";
import { rolesStillNeeded, staffingLabel } from "./staffingGap";

/**
 * The gap is derived from real `/projects/{id}/details` fields, so the fixtures
 * use that shape. It is a count of unmet requirements — never a score.
 */

const BACKEND = "role-backend";
const FRONTEND = "role-frontend";

function details(
  requirements: readonly { role: string; required: number }[],
  members: readonly (readonly string[])[],
): ProjectStaffingDetails {
  return {
    projectId: "p1",
    teamRoleRequirements: requirements.map((requirement) => ({
      teamRole: { teamRoleId: requirement.role },
      requiredMembers: requirement.required,
    })),
    activeMembers: members.map((roles) => ({
      roles: roles.map((teamRoleId) => ({ teamRoleId })),
    })),
  };
}

describe("rolesStillNeeded", () => {
  it("reports none when every requirement is met", () => {
    const project = details(
      [{ role: BACKEND, required: 2 }],
      [[BACKEND], [BACKEND]],
    );

    expect(rolesStillNeeded(project)).toBe(0);
  });

  it("reports a role that is short of people", () => {
    const project = details([{ role: BACKEND, required: 2 }], [[BACKEND]]);

    expect(rolesStillNeeded(project)).toBe(1);
  });

  it("counts each unmet requirement, not each missing person", () => {
    // Backend is two short and frontend is one short: two roles need attention,
    // which is what a manager acts on.
    const project = details(
      [
        { role: BACKEND, required: 3 },
        { role: FRONTEND, required: 2 },
      ],
      [[BACKEND], [FRONTEND]],
    );

    expect(rolesStillNeeded(project)).toBe(2);
  });

  it("counts a member who holds two required roles toward both", () => {
    // The backend records the roles an allocation carries; there is no
    // one-role-per-person rule to invent here.
    const project = details(
      [
        { role: BACKEND, required: 1 },
        { role: FRONTEND, required: 1 },
      ],
      [[BACKEND, FRONTEND]],
    );

    expect(rolesStillNeeded(project)).toBe(0);
  });

  it("ignores members whose roles are not required", () => {
    const project = details([{ role: BACKEND, required: 1 }], [["role-qa"]]);

    expect(rolesStillNeeded(project)).toBe(1);
  });

  it("reports none when a project declares no requirements", () => {
    // Nothing was asked for, so nothing is missing — not "fully staffed by luck".
    expect(rolesStillNeeded(details([], []))).toBe(0);
  });

  it("reports every requirement when nobody is allocated yet", () => {
    const project = details(
      [
        { role: BACKEND, required: 1 },
        { role: FRONTEND, required: 2 },
      ],
      [],
    );

    expect(rolesStillNeeded(project)).toBe(2);
  });
});

describe("staffingLabel", () => {
  it("says the team is staffed when nothing is missing", () => {
    expect(staffingLabel(0)).toBe("Team staffed");
  });

  it("counts in words, singular and plural", () => {
    expect(staffingLabel(1)).toBe("1 role still needed");
    expect(staffingLabel(3)).toBe("3 roles still needed");
  });

  it("says so plainly when staffing was never looked up", () => {
    // Distinct from zero: "Team staffed" would be a claim nobody verified.
    expect(staffingLabel(null)).toBe("Staffing not checked");
    expect(staffingLabel(null)).not.toBe(staffingLabel(0));
  });
});
