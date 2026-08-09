import { describe, expect, it } from "vitest";

import type { ProjectStaffingDetails } from "../model/projectsData";

import { openStaffingSlots, staffingLabel } from "./staffingSlots";

/**
 * The figure is a count of open staffing positions — the people a manager still
 * has to find — derived from real `/projects/{id}/details` fields.
 *
 * The cases with `requiredMembers > 1` are the ones that matter most: counting
 * understaffed role *types* would report a role needing four people with one
 * filled as a shortage of one instead of three.
 */

const BACKEND = "role-backend";
const FRONTEND = "role-frontend";
const QA = "role-qa";

function details(
  requirements: readonly { role: string; required: number }[],
  members: readonly (readonly string[])[],
): ProjectStaffingDetails {
  return {
    teamRoleRequirements: requirements.map((requirement) => ({
      teamRole: { teamRoleId: requirement.role },
      requiredMembers: requirement.required,
    })),
    activeMembers: members.map((roles) => ({
      roles: roles.map((teamRoleId) => ({ teamRoleId })),
    })),
  };
}

describe("openStaffingSlots", () => {
  it("reports none when every requirement is met", () => {
    expect(openStaffingSlots(details([{ role: BACKEND, required: 2 }], [[BACKEND], [BACKEND]])))
      .toBe(0);
  });

  it("reports one open position when a role is one person short", () => {
    expect(openStaffingSlots(details([{ role: BACKEND, required: 2 }], [[BACKEND]]))).toBe(1);
  });

  it("counts every missing person in a single role, not the role once", () => {
    // Four wanted, one filled, so three people are missing — not "one
    // understaffed role".
    expect(openStaffingSlots(details([{ role: BACKEND, required: 4 }], [[BACKEND]]))).toBe(3);
  });

  it("sums shortfalls across roles", () => {
    // Backend 3/1 → 2, Frontend 2/1 → 1, QA 1/1 → 0.
    const project = details(
      [
        { role: BACKEND, required: 3 },
        { role: FRONTEND, required: 2 },
        { role: QA, required: 1 },
      ],
      [[BACKEND], [FRONTEND], [QA]],
    );

    expect(openStaffingSlots(project)).toBe(3);
  });

  it("lets one member satisfy two different role requirements", () => {
    // The backend records the roles an allocation carries; there is no
    // one-role-per-person rule to invent here.
    const project = details(
      [
        { role: BACKEND, required: 1 },
        { role: FRONTEND, required: 1 },
      ],
      [[BACKEND, FRONTEND]],
    );

    expect(openStaffingSlots(project)).toBe(0);
  });

  it("does not let a member fill the same role twice", () => {
    // One person is one person, however the roles are listed.
    const project = details([{ role: BACKEND, required: 2 }], [[BACKEND, BACKEND]]);

    expect(openStaffingSlots(project)).toBe(1);
  });

  it("ignores members whose roles the project did not ask for", () => {
    expect(openStaffingSlots(details([{ role: BACKEND, required: 1 }], [[QA]]))).toBe(1);
  });

  it("never reports a negative shortage for an over-filled role", () => {
    // Three people on a role that wanted one is not "minus two positions", and
    // must not offset a genuine shortage elsewhere.
    const project = details(
      [
        { role: BACKEND, required: 1 },
        { role: FRONTEND, required: 2 },
      ],
      [[BACKEND], [BACKEND], [BACKEND]],
    );

    expect(openStaffingSlots(project)).toBe(2);
  });

  it("reports none when a project declares no requirements", () => {
    expect(openStaffingSlots(details([], []))).toBe(0);
  });

  it("reports every required position when nobody is allocated yet", () => {
    const project = details(
      [
        { role: BACKEND, required: 2 },
        { role: FRONTEND, required: 1 },
      ],
      [],
    );

    expect(openStaffingSlots(project)).toBe(3);
  });
});

describe("staffingLabel", () => {
  it("says the team is staffed when nothing is open", () => {
    expect(staffingLabel(0)).toBe("Team staffed");
  });

  it("counts positions, singular and plural", () => {
    expect(staffingLabel(1)).toBe("1 position still needed");
    expect(staffingLabel(3)).toBe("3 positions still needed");
  });

  it("says positions rather than roles, because that is what is counted", () => {
    expect(staffingLabel(2)).not.toContain("role");
  });

  it("says the figure is unavailable when the row's detail failed", () => {
    // Every row in the list is attempted, so null means "tried and could not
    // tell" — never a silent zero.
    expect(staffingLabel(null)).toBe("Staffing unavailable");
    expect(staffingLabel(null)).not.toBe(staffingLabel(0));
  });
});
