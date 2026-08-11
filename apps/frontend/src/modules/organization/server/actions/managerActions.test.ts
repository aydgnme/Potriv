import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_MANAGER_STATE } from "../../model/organizationActionState";

/**
 * Manager appointment, from the outside.
 *
 * The rule this file exists to protect: appointing somebody is not granting them
 * a role, and removing them is not taking one away. No test here should ever see
 * a user-role call, and the absence is asserted rather than assumed.
 *
 * Eligibility is re-derived from fresh reads too. A picker rendered before a role
 * was revoked, or before somebody took another department, cannot carry a stale
 * answer through.
 */

const resolveProductSession = vi.fn();
const getDepartments = vi.fn();
const getOrganizationMembers = vi.fn();
const assignDepartmentManager = vi.fn();
const removeDepartmentManager = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/modules/auth/server/productSession", () => ({ resolveProductSession }));
vi.mock("../organizationDataSources", () => ({
  getDepartments,
  getOrganizationMembers,
  assignDepartmentManager,
  removeDepartmentManager,
}));
vi.mock("next/cache", () => ({ revalidatePath }));

const { assignDepartmentManagerAction, removeDepartmentManagerAction } = await import(
  "./managerActions"
);

const PLATFORM = "3e38e3cc-140c-4b89-a51d-a184c6e85700";
const QA = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const ANA = "0f7d1c62-4b0e-4a6f-9d2a-7c1b8e5f3a10";
const BOB = "9f8e7d6c-5b4a-4392-8172-6a5b4c3d2e1f";
const CARA = "686fcfea-14c7-493f-9c7a-2aa31267723a";

function department(departmentId: string, name: string, manager: unknown = null) {
  return {
    departmentId,
    name,
    manager,
    memberCount: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  };
}

function person(userId: string, name: string, ...roles: string[]) {
  return { userId, name, email: `${name.toLowerCase()}@potriv.test`, roles };
}

function summary(userId: string, name: string) {
  return { userId, name, email: `${name.toLowerCase()}@potriv.test` };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveProductSession.mockResolvedValue({
    authenticated: true,
    user: { userId: "oa-1", roles: ["EMPLOYEE", "ORGANIZATION_ADMIN"] },
  });
  getDepartments.mockResolvedValue({
    ok: true,
    value: [department(PLATFORM, "Platform"), department(QA, "QA", summary(CARA, "Cara"))],
  });
  getOrganizationMembers.mockResolvedValue({
    ok: true,
    value: [
      person(ANA, "Ana", "EMPLOYEE", "DEPARTMENT_MANAGER"),
      person(BOB, "Bob", "EMPLOYEE"),
      person(CARA, "Cara", "EMPLOYEE", "DEPARTMENT_MANAGER"),
    ],
  });
  assignDepartmentManager.mockResolvedValue({
    ok: true,
    value: department(PLATFORM, "Platform", summary(ANA, "Ana")),
  });
  removeDepartmentManager.mockResolvedValue({ ok: true, value: undefined });
});

describe("appointing a manager", () => {
  it("sends the department in the path and only the user in the body", async () => {
    await assignDepartmentManagerAction(
      EMPTY_MANAGER_STATE,
      form({ departmentId: PLATFORM, userId: ANA }),
    );

    expect(assignDepartmentManager).toHaveBeenCalledWith(PLATFORM, ANA);
    expect(assignDepartmentManager.mock.calls[0]).toHaveLength(2);
  });

  it("names the person and the department on success", async () => {
    const state = await assignDepartmentManagerAction(
      EMPTY_MANAGER_STATE,
      form({ departmentId: PLATFORM, userId: ANA }),
    );

    expect(state.done).toBe("Ana is now the manager of Platform.");
  });

  it("refreshes the places an appointment changes the meaning of", async () => {
    await assignDepartmentManagerAction(
      EMPTY_MANAGER_STATE,
      form({ departmentId: PLATFORM, userId: ANA }),
    );

    for (const path of [
      "/organization",
      "/organization/departments",
      `/organization/departments/${PLATFORM}`,
      "/home",
      "/people",
      "/staffing",
    ]) {
      expect(revalidatePath).toHaveBeenCalledWith(path);
    }
  });

  it("re-appoints the person already in place", async () => {
    getDepartments.mockResolvedValue({
      ok: true,
      value: [department(PLATFORM, "Platform", summary(ANA, "Ana"))],
    });

    await assignDepartmentManagerAction(
      EMPTY_MANAGER_STATE,
      form({ departmentId: PLATFORM, userId: ANA }),
    );

    // The backend treats this as idempotent; nothing here invents a refusal.
    expect(assignDepartmentManager).toHaveBeenCalledWith(PLATFORM, ANA);
  });

  it("replaces one eligible manager with another", async () => {
    getDepartments.mockResolvedValue({
      ok: true,
      value: [department(PLATFORM, "Platform", summary(ANA, "Ana"))],
    });

    await assignDepartmentManagerAction(
      EMPTY_MANAGER_STATE,
      form({ departmentId: PLATFORM, userId: CARA }),
    );

    expect(assignDepartmentManager).toHaveBeenCalledWith(PLATFORM, CARA);
  });

  it("reports a race the backend caught without claiming success", async () => {
    assignDepartmentManager.mockResolvedValue({
      ok: false,
      status: 409,
      detail: "Department or user already has a manager assignment.",
    });

    const state = await assignDepartmentManagerAction(
      EMPTY_MANAGER_STATE,
      form({ departmentId: PLATFORM, userId: ANA }),
    );

    expect(state.error).toContain("already has a manager assignment");
    expect(state.done).toBeUndefined();
  });
});

describe("the appointment trust boundary", () => {
  async function expectRejected(fields: Record<string, string>) {
    const state = await assignDepartmentManagerAction(EMPTY_MANAGER_STATE, form(fields));
    expect(assignDepartmentManager).not.toHaveBeenCalled();
    return state;
  }

  it("refuses a session without the organization-admin role, before reading anything", async () => {
    resolveProductSession.mockResolvedValue({
      authenticated: true,
      user: { userId: "dm-1", roles: ["EMPLOYEE", "DEPARTMENT_MANAGER"] },
    });

    await expectRejected({ departmentId: PLATFORM, userId: ANA });
    expect(getDepartments).not.toHaveBeenCalled();
    expect(getOrganizationMembers).not.toHaveBeenCalled();
  });

  it("refuses a department id that is not an identifier", async () => {
    for (const departmentId of ["", "../departments", "not-a-uuid"]) {
      vi.clearAllMocks();
      await expectRejected({ departmentId, userId: ANA });
    }
  });

  it("refuses a user id that is not an identifier", async () => {
    for (const userId of ["", "../users", "not-a-uuid"]) {
      vi.clearAllMocks();
      await expectRejected({ departmentId: PLATFORM, userId });
    }
  });

  it("refuses a department absent from the fresh list", async () => {
    getDepartments.mockResolvedValue({ ok: true, value: [department(QA, "QA")] });

    const state = await expectRejected({ departmentId: PLATFORM, userId: ANA });
    expect(state.error).toBe("This department does not exist or is not visible to you.");
  });

  it("refuses a user absent from the fresh organization", async () => {
    getOrganizationMembers.mockResolvedValue({ ok: true, value: [person(BOB, "Bob", "EMPLOYEE")] });

    await expectRejected({ departmentId: PLATFORM, userId: ANA });
  });

  it("refuses somebody who does not hold the Department Manager role", async () => {
    const state = await expectRejected({ departmentId: PLATFORM, userId: BOB });
    expect(state.error).toContain("Department Manager role");
  });

  it("refuses somebody already managing another department", async () => {
    const state = await expectRejected({ departmentId: PLATFORM, userId: CARA });
    expect(state.error).toContain("QA");
  });

  it("derives eligibility from the fresh read, not from the form", async () => {
    // The picker was rendered when Ana still held the role.
    getOrganizationMembers.mockResolvedValue({
      ok: true,
      value: [person(ANA, "Ana", "EMPLOYEE"), person(CARA, "Cara", "EMPLOYEE", "DEPARTMENT_MANAGER")],
    });

    const state = await expectRejected({ departmentId: PLATFORM, userId: ANA });
    expect(state.error).toContain("Department Manager role");
  });
});

describe("removing a manager", () => {
  it("calls the manager endpoint for that department only", async () => {
    getDepartments.mockResolvedValue({
      ok: true,
      value: [department(PLATFORM, "Platform", summary(ANA, "Ana"))],
    });

    await removeDepartmentManagerAction(EMPTY_MANAGER_STATE, form({ departmentId: PLATFORM }));

    expect(removeDepartmentManager).toHaveBeenCalledWith(PLATFORM);
  });

  it("says the access role is unchanged", async () => {
    const state = await removeDepartmentManagerAction(
      EMPTY_MANAGER_STATE,
      form({ departmentId: PLATFORM }),
    );

    expect(state.done).toContain("Department Manager access role is unchanged");
  });

  it("refuses a department absent from the fresh list", async () => {
    getDepartments.mockResolvedValue({ ok: true, value: [department(QA, "QA")] });

    const state = await removeDepartmentManagerAction(
      EMPTY_MANAGER_STATE,
      form({ departmentId: PLATFORM }),
    );

    expect(removeDepartmentManager).not.toHaveBeenCalled();
    expect(state.error).toBe("This department does not exist or is not visible to you.");
  });

  it("refuses a non-admin before reading anything", async () => {
    resolveProductSession.mockResolvedValue({
      authenticated: true,
      user: { userId: "dm-1", roles: ["EMPLOYEE", "DEPARTMENT_MANAGER"] },
    });

    await removeDepartmentManagerAction(EMPTY_MANAGER_STATE, form({ departmentId: PLATFORM }));

    expect(removeDepartmentManager).not.toHaveBeenCalled();
    expect(getDepartments).not.toHaveBeenCalled();
  });
});

describe("an appointment is not a role", () => {
  it("exposes no user-role mutation at all", async () => {
    // The module's own data-source surface is the proof: there is nothing here
    // that could change somebody's access roles, in either direction.
    const sources = await import("../organizationDataSources");

    expect(Object.keys(sources)).not.toContain("updateUserRoles");
    for (const name of Object.keys(sources)) {
      expect(name.toLowerCase()).not.toContain("role");
    }
  });

  it("appoints and removes without touching roles", async () => {
    await assignDepartmentManagerAction(
      EMPTY_MANAGER_STATE,
      form({ departmentId: PLATFORM, userId: ANA }),
    );
    await removeDepartmentManagerAction(EMPTY_MANAGER_STATE, form({ departmentId: PLATFORM }));

    expect(assignDepartmentManager).toHaveBeenCalledTimes(1);
    expect(removeDepartmentManager).toHaveBeenCalledTimes(1);
    expect(getOrganizationMembers).toHaveBeenCalled();
    // Reading who exists is not writing what they may do.
    expect(getOrganizationMembers.mock.calls.every((call) => call.length === 0)).toBe(true);
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
    "/departments/",
    "Exception",
    "timestamp",
  ];

  it("carries no token, header, backend path or envelope on any failure", async () => {
    for (const status of [400, 401, 403, 404, 409, 500]) {
      assignDepartmentManager.mockResolvedValue({ ok: false, status, detail: null });
      removeDepartmentManager.mockResolvedValue({ ok: false, status, detail: null });

      for (const state of [
        await assignDepartmentManagerAction(
          EMPTY_MANAGER_STATE,
          form({ departmentId: PLATFORM, userId: ANA }),
        ),
        await removeDepartmentManagerAction(
          EMPTY_MANAGER_STATE,
          form({ departmentId: PLATFORM }),
        ),
      ]) {
        const serialized = JSON.stringify(state);
        for (const leak of LEAKS) expect(serialized).not.toContain(leak);
      }
    }
  });
});
