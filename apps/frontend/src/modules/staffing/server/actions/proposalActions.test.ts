import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_PROPOSAL_STATE } from "../../model/proposalState";
import type { StaffingProjectContext } from "../../model/teamFinderData";

/**
 * Proposing someone, from the outside.
 *
 * The form is the browser's, so nothing it sends is authority. The project is
 * read again inside the action and the allowed roles recomputed from what it
 * actually requires now — a role that has since been filled, deactivated or was
 * never offered is refused here, before the backend is asked anything.
 */

const resolveProductSession = vi.fn();
const getProjectContext = vi.fn();
const proposeAssignment = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/modules/auth/server/productSession", () => ({ resolveProductSession }));
vi.mock("../staffingDataSources", () => ({ getProjectContext, proposeAssignment }));
vi.mock("next/cache", () => ({ revalidatePath }));

const { proposeAssignmentAction } = await import("./proposalActions");

const PROJECT_ID = "0f7d1c62-4b0e-4a6f-9d2a-7c1b8e5f3a10";
const EMPLOYEE_ID = "8b3c2d41-5a6e-4f7b-9c0d-1e2f3a4b5c6d";
const OWNER_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

const BACKEND_ROLE = "3a1f0b44-1111-4222-8333-444455556666";
const FILLED_ROLE = "3a1f0b44-2222-4222-8333-444455556666";
const INACTIVE_ROLE = "3a1f0b44-9999-4222-8333-444455556666";

function project(overrides: Partial<StaffingProjectContext> = {}): StaffingProjectContext {
  return {
    projectId: PROJECT_ID,
    projectName: "Apollo",
    projectStatus: "IN_PROGRESS",
    projectPeriod: "FIXED",
    startDate: "2026-01-05",
    deadlineDate: "2026-09-30",
    projectManager: { userId: OWNER_ID, name: "Deniz", email: "deniz@potriv.test" },
    technologyStack: [{ technologyId: "t1", name: "TypeScript" }],
    teamRoleRequirements: [
      {
        requirementId: "r1",
        teamRole: { teamRoleId: BACKEND_ROLE, name: "Backend", active: true },
        requiredMembers: 3,
      },
      {
        requirementId: "r2",
        teamRole: { teamRoleId: FILLED_ROLE, name: "QA", active: true },
        requiredMembers: 1,
      },
      {
        requirementId: "r3",
        teamRole: { teamRoleId: INACTIVE_ROLE, name: "Deprecated", active: false },
        requiredMembers: 1,
      },
    ],
    activeMembers: [
      {
        allocationId: "a1",
        employee: { userId: "u1", name: "Mehmet", email: "m@potriv.test" },
        roles: [{ teamRoleId: BACKEND_ROLE }, { teamRoleId: FILLED_ROLE }],
      },
    ],
    ...overrides,
  };
}

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const entry of Array.isArray(value) ? value : [value]) data.append(name, entry);
  }
  return data;
}

function validForm(overrides: Record<string, string | string[]> = {}): FormData {
  return form({
    projectId: PROJECT_ID,
    employeeId: EMPLOYEE_ID,
    workHoursPerDay: "4",
    teamRoleId: [BACKEND_ROLE],
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveProductSession.mockResolvedValue({
    authenticated: true,
    user: { userId: OWNER_ID, roles: ["EMPLOYEE", "PROJECT_MANAGER"] },
  });
  getProjectContext.mockResolvedValue({ ok: true, value: project() });
  proposeAssignment.mockResolvedValue({
    ok: true,
    value: {
      proposalId: "prop-1",
      employee: { userId: EMPLOYEE_ID, name: "Elif", email: "elif@potriv.test" },
      reviewDepartment: { departmentId: "d1", name: "Platform Engineering" },
      workHoursPerDay: 4,
      teamRoles: [{ teamRoleId: BACKEND_ROLE, name: "Backend" }],
      status: "PENDING",
    },
  });
});

describe("success", () => {
  it("sends exactly the supported fields, and nothing else", async () => {
    await proposeAssignmentAction(
      EMPTY_PROPOSAL_STATE,
      validForm({ comments: "  Strong backend match  " }),
    );

    expect(proposeAssignment).toHaveBeenCalledWith(PROJECT_ID, {
      employeeId: EMPLOYEE_ID,
      workHoursPerDay: 4,
      teamRoleIds: [BACKEND_ROLE],
      comments: "Strong backend match",
    });
  });

  it("names the reviewing department from the backend's response", async () => {
    // Not from the form, and not from the candidate's department shown on
    // screen: the backend snapshots the review department itself.
    const state = await proposeAssignmentAction(EMPTY_PROPOSAL_STATE, validForm());

    expect(state.sentTo).toBe("Platform Engineering");
    expect(state.formError).toBeUndefined();
  });

  it("refreshes the team page and the finder, because both changed", async () => {
    await proposeAssignmentAction(EMPTY_PROPOSAL_STATE, validForm());

    expect(revalidatePath).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/team`);
    expect(revalidatePath).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/team-finder`);
  });

  it("omits empty comments rather than sending a blank string", async () => {
    await proposeAssignmentAction(EMPTY_PROPOSAL_STATE, validForm({ comments: "   " }));

    const [, body] = proposeAssignment.mock.calls[0]!;
    expect("comments" in body).toBe(false);
  });
});

describe("the trust boundary", () => {
  async function expectRejected(formData: FormData) {
    const state = await proposeAssignmentAction(EMPTY_PROPOSAL_STATE, formData);
    expect(proposeAssignment).not.toHaveBeenCalled();
    return state;
  }

  it("refuses a session without the project-manager role, before reading anything", async () => {
    resolveProductSession.mockResolvedValue({
      authenticated: true,
      user: { userId: OWNER_ID, roles: ["EMPLOYEE", "DEPARTMENT_MANAGER"] },
    });

    await expectRejected(validForm());
    expect(getProjectContext).not.toHaveBeenCalled();
  });

  it("refuses a project manager who does not own this project", async () => {
    resolveProductSession.mockResolvedValue({
      authenticated: true,
      user: { userId: "someone-else", roles: ["EMPLOYEE", "PROJECT_MANAGER"] },
    });

    const state = await expectRejected(validForm());
    // The anti-leak sentence: being refused must not confirm the project is real.
    expect(state.formError).toBe("This project does not exist or is not visible to you.");
  });

  it("refuses anything that is not an identifier", async () => {
    for (const projectId of ["", "../projects", "not-a-uuid", "1 OR 1=1"]) {
      await expectRejected(validForm({ projectId }));
    }
    for (const employeeId of ["", "../users", "not-a-uuid"]) {
      await expectRejected(validForm({ employeeId }));
    }
  });

  it("refuses hours that are not whole and at least one", async () => {
    for (const workHoursPerDay of ["0", "-2", "1.5", "", "four"]) {
      const state = await expectRejected(validForm({ workHoursPerDay }));
      expect(state.fieldErrors.workHoursPerDay).toBeDefined();
    }
  });

  it("refuses a duplicated role", async () => {
    const state = await expectRejected(
      validForm({ teamRoleId: [BACKEND_ROLE, BACKEND_ROLE] }),
    );

    expect(state.fieldErrors.teamRoleIds).toContain("once");
  });

  it("refuses a role that is no longer open, whatever the form claims", async () => {
    // QA is filled. The page may have been loaded before that happened.
    const state = await expectRejected(validForm({ teamRoleId: [FILLED_ROLE] }));

    expect(state.fieldErrors.teamRoleIds).toContain("no longer open");
  });

  it("refuses an inactive role", async () => {
    const state = await expectRejected(validForm({ teamRoleId: [INACTIVE_ROLE] }));

    expect(state.fieldErrors.teamRoleIds).toBeDefined();
  });

  it("refuses a role this project never had", async () => {
    const state = await expectRejected(
      validForm({ teamRoleId: ["11111111-2222-4333-8444-555566667777"] }),
    );

    expect(state.fieldErrors.teamRoleIds).toBeDefined();
  });

  it("refuses a proposal with no role at all", async () => {
    const state = await expectRejected(validForm({ teamRoleId: [] }));

    expect(state.fieldErrors.teamRoleIds).toContain("at least one");
  });

  it("refuses comments over the limit", async () => {
    const state = await expectRejected(validForm({ comments: "x".repeat(5001) }));

    expect(state.fieldErrors.comments).toBeDefined();
  });

  it("derives the allowed roles from the project, not from the form", async () => {
    // Backend is the only active role still short of people.
    await proposeAssignmentAction(EMPTY_PROPOSAL_STATE, validForm());

    expect(getProjectContext).toHaveBeenCalledWith(PROJECT_ID);
    const [, body] = proposeAssignment.mock.calls[0]!;
    expect(body.teamRoleIds).toEqual([BACKEND_ROLE]);
  });
});

describe("capacity races", () => {
  it("keeps the form open and explains a conflict in the backend's own words", async () => {
    // The finder's capacity figure is a snapshot; someone may have been staffed
    // in between. The backend is the authority.
    proposeAssignment.mockResolvedValue({
      ok: false,
      status: 409,
      detail: "workHoursPerDay exceeds the employee's available capacity of 1 hours.",
    });

    const state = await proposeAssignmentAction(EMPTY_PROPOSAL_STATE, validForm());

    expect(state.formError).toContain("available capacity");
    expect(state.sentTo).toBeUndefined();
  });

  it("falls back to its own sentence when the backend offers none", async () => {
    proposeAssignment.mockResolvedValue({ ok: false, status: 409, detail: null });

    const state = await proposeAssignmentAction(EMPTY_PROPOSAL_STATE, validForm());

    expect(state.formError).toBe("This no longer fits the employee's current capacity.");
  });
});

describe("what crosses back to the browser", () => {
  const LEAKS = [
    "Bearer",
    "Authorization",
    "accessToken",
    "refreshToken",
    "localhost:8080",
    "/api/",
    "/projects/",
    "Exception",
    "timestamp",
  ];

  it("carries no token, header, backend path or envelope on any failure", async () => {
    for (const status of [400, 401, 403, 404, 409, 500]) {
      proposeAssignment.mockResolvedValue({ ok: false, status, detail: null });

      const serialized = JSON.stringify(
        await proposeAssignmentAction(EMPTY_PROPOSAL_STATE, validForm()),
      );
      for (const leak of LEAKS) expect(serialized).not.toContain(leak);
    }
  });

  it("carries nothing but field names and sentences when validation fails", async () => {
    const state = await proposeAssignmentAction(
      EMPTY_PROPOSAL_STATE,
      validForm({ workHoursPerDay: "0" }),
    );

    expect(Object.keys(state.fieldErrors)).toEqual(["workHoursPerDay"]);
    for (const leak of LEAKS) expect(JSON.stringify(state)).not.toContain(leak);
  });
});
