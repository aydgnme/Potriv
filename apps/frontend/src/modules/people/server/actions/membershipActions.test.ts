import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_MEMBERSHIP_STATE } from "../../model/peopleActionState";

/**
 * Department membership, from the outside.
 *
 * The department id is never taken from the browser: it is re-resolved on every
 * mutation, so a form cannot aim at somebody else's department however it is
 * edited. Membership is all that changes — no account, no access role.
 */

const resolveProductSession = vi.fn();
const getManagedDepartment = vi.fn();
const getDepartmentMembers = vi.fn();
const getUnassignedEmployees = vi.fn();
const addDepartmentMember = vi.fn();
const removeDepartmentMember = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/modules/auth/server/productSession", () => ({ resolveProductSession }));
vi.mock("../peopleDataSources", () => ({
  getManagedDepartment,
  getDepartmentMembers,
  getUnassignedEmployees,
  addDepartmentMember,
  removeDepartmentMember,
}));
vi.mock("next/cache", () => ({ revalidatePath }));

const { addDepartmentMemberAction, removeDepartmentMemberAction } = await import(
  "./membershipActions"
);

const TARGET = "0f7d1c62-4b0e-4a6f-9d2a-7c1b8e5f3a10";
const MY_DEPARTMENT = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const OTHER_DEPARTMENT = "9f8e7d6c-5b4a-4392-8172-6a5b4c3d2e1f";

function person(userId: string, name: string) {
  return { userId, name, email: `${name}@potriv.test`, accessRoles: ["EMPLOYEE"] };
}

function form(fields: Record<string, string> = {}): FormData {
  const data = new FormData();
  data.set("userId", TARGET);
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveProductSession.mockResolvedValue({
    authenticated: true,
    user: { userId: "dm-1", roles: ["EMPLOYEE", "DEPARTMENT_MANAGER"] },
  });
  getManagedDepartment.mockResolvedValue({
    ok: true,
    value: { departmentId: MY_DEPARTMENT, name: "Platform Engineering" },
  });
  getUnassignedEmployees.mockResolvedValue({ ok: true, value: [person(TARGET, "Ana")] });
  getDepartmentMembers.mockResolvedValue({ ok: true, value: [person(TARGET, "Ana")] });
  addDepartmentMember.mockResolvedValue({ ok: true, value: person(TARGET, "Ana") });
  removeDepartmentMember.mockResolvedValue({ ok: true, value: undefined });
});

describe("adding a member", () => {
  it("uses the department resolved from the backend", async () => {
    await addDepartmentMemberAction(EMPTY_MEMBERSHIP_STATE, form());

    expect(getManagedDepartment).toHaveBeenCalledTimes(1);
    expect(addDepartmentMember).toHaveBeenCalledWith(MY_DEPARTMENT, TARGET);
  });

  it("ignores a department id the browser tried to supply", async () => {
    // A form cannot aim at another department however it is edited.
    await addDepartmentMemberAction(
      EMPTY_MEMBERSHIP_STATE,
      form({ departmentId: OTHER_DEPARTMENT }),
    );

    expect(addDepartmentMember).toHaveBeenCalledWith(MY_DEPARTMENT, TARGET);
  });

  it("treats the call as a success without expecting a created status", async () => {
    // The endpoint answers 200, not 201; the transport reports ok either way and
    // nothing here asserts a particular success code.
    const state = await addDepartmentMemberAction(EMPTY_MEMBERSHIP_STATE, form());

    expect(state.error).toBeUndefined();
    expect(state.done).toContain("added to your department");
  });

  it("says nothing about roles, because none changed", async () => {
    const state = await addDepartmentMemberAction(EMPTY_MEMBERSHIP_STATE, form());

    expect(state.done).not.toMatch(/role|permission|Employee/i);
  });

  it("refreshes People and Home", async () => {
    await addDepartmentMemberAction(EMPTY_MEMBERSHIP_STATE, form());

    expect(revalidatePath).toHaveBeenCalledWith("/people");
    expect(revalidatePath).toHaveBeenCalledWith("/home");
  });

  it("checks the pool the backend defines, never the organization list", async () => {
    await addDepartmentMemberAction(EMPTY_MEMBERSHIP_STATE, form());

    expect(getUnassignedEmployees).toHaveBeenCalledTimes(1);
  });

  it("refuses somebody who left the unassigned pool since the page rendered", async () => {
    getUnassignedEmployees.mockResolvedValue({ ok: true, value: [] });

    const state = await addDepartmentMemberAction(EMPTY_MEMBERSHIP_STATE, form());

    expect(state.error).toContain("no longer unassigned");
    expect(addDepartmentMember).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/people");
  });

  it("reports a conflict without moving anyone", async () => {
    addDepartmentMember.mockResolvedValue({
      ok: false,
      status: 409,
      detail: "User already belongs to another department.",
    });

    const state = await addDepartmentMemberAction(EMPTY_MEMBERSHIP_STATE, form());

    expect(state.error).toContain("already belongs to another department");
    expect(state.done).toBeUndefined();
    expect(revalidatePath).toHaveBeenCalledWith("/people");
  });
});

describe("removing a member", () => {
  it("deletes from the resolved department only", async () => {
    await removeDepartmentMemberAction(EMPTY_MEMBERSHIP_STATE, form());

    expect(removeDepartmentMember).toHaveBeenCalledWith(MY_DEPARTMENT, TARGET);
  });

  it("checks the person is in this department's current member list first", async () => {
    getDepartmentMembers.mockResolvedValue({ ok: true, value: [] });

    const state = await removeDepartmentMemberAction(EMPTY_MEMBERSHIP_STATE, form());

    expect(state.error).toContain("no longer in your department");
    expect(removeDepartmentMember).not.toHaveBeenCalled();
  });

  it("says the account and roles are unchanged", async () => {
    const state = await removeDepartmentMemberAction(EMPTY_MEMBERSHIP_STATE, form());

    expect(state.done).toContain("account and access roles are unchanged");
    // Never claims anything about projects or allocations.
    expect(state.done).not.toMatch(/project|allocation|deleted/i);
  });
});

describe("the trust boundary", () => {
  async function expectNoMutation(run: () => Promise<unknown>) {
    await run();
    expect(addDepartmentMember).not.toHaveBeenCalled();
    expect(removeDepartmentMember).not.toHaveBeenCalled();
  }

  it("refuses a session without the department-manager role, before reading anything", async () => {
    resolveProductSession.mockResolvedValue({
      authenticated: true,
      user: { userId: "oa-1", roles: ["EMPLOYEE", "ORGANIZATION_ADMIN"] },
    });

    await expectNoMutation(() => addDepartmentMemberAction(EMPTY_MEMBERSHIP_STATE, form()));
    expect(getManagedDepartment).not.toHaveBeenCalled();
  });

  it("refuses a manager with no department", async () => {
    getManagedDepartment.mockResolvedValue({ ok: false, reason: "FORBIDDEN" });

    const state = await addDepartmentMemberAction(EMPTY_MEMBERSHIP_STATE, form());

    expect(state.error).toContain("not managing a department");
    expect(addDepartmentMember).not.toHaveBeenCalled();
  });

  it("refuses anything that is not an identifier", async () => {
    for (const userId of ["", "../users", "not-a-uuid"]) {
      const data = new FormData();
      data.set("userId", userId);

      await expectNoMutation(() => addDepartmentMemberAction(EMPTY_MEMBERSHIP_STATE, data));
      await expectNoMutation(() => removeDepartmentMemberAction(EMPTY_MEMBERSHIP_STATE, data));
    }
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
      addDepartmentMember.mockResolvedValue({ ok: false, status, detail: null });
      removeDepartmentMember.mockResolvedValue({ ok: false, status, detail: null });

      for (const state of [
        await addDepartmentMemberAction(EMPTY_MEMBERSHIP_STATE, form()),
        await removeDepartmentMemberAction(EMPTY_MEMBERSHIP_STATE, form()),
      ]) {
        const serialized = JSON.stringify(state);
        for (const leak of LEAKS) expect(serialized).not.toContain(leak);
      }
    }
  });
});
