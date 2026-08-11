import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AccessRole } from "@/shared/types/accessRole";

import { EMPTY_ROLE_STATE } from "../../model/peopleActionState";

/**
 * Changing access roles, from the outside.
 *
 * Every fact the decision rests on is re-read here. The form knows who it is
 * editing and how many admins exist, but a page loaded an hour ago would happily
 * claim to be the only person in the organization — so none of it is believed.
 */

const resolveProductSession = vi.fn();
const getOrganizationUsers = vi.fn();
const getOrganizationUser = vi.fn();
const updateUserRoles = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/modules/auth/server/productSession", () => ({ resolveProductSession }));
vi.mock("../peopleDataSources", () => ({
  getOrganizationUsers,
  getOrganizationUser,
  updateUserRoles,
}));
vi.mock("next/cache", () => ({ revalidatePath }));

const { updateUserRolesAction } = await import("./roleActions");

const ME = "0f7d1c62-4b0e-4a6f-9d2a-7c1b8e5f3a10";
const OTHER = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

function user(userId: string, ...roles: AccessRole[]) {
  return {
    userId,
    organizationId: "org-1",
    name: userId === ME ? "Me" : "Other",
    email: `${userId}@potriv.test`,
    roles,
  };
}

function form(userId: string, roles: readonly string[]): FormData {
  const data = new FormData();
  data.set("userId", userId);
  for (const role of roles) data.append("role", role);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveProductSession.mockResolvedValue({
    authenticated: true,
    user: { userId: ME, roles: ["EMPLOYEE", "ORGANIZATION_ADMIN"] },
  });
  getOrganizationUsers.mockResolvedValue({
    ok: true,
    value: [user(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"), user(OTHER, "EMPLOYEE")],
  });
  getOrganizationUser.mockResolvedValue({ ok: true, value: user(OTHER, "EMPLOYEE") });
  updateUserRoles.mockResolvedValue({
    ok: true,
    value: { ...user(OTHER, "EMPLOYEE", "PROJECT_MANAGER"), createdAt: null, updatedAt: null },
  });
});

describe("success", () => {
  it("sends the complete desired role set", async () => {
    const state = await updateUserRolesAction(
      EMPTY_ROLE_STATE,
      form(OTHER, ["EMPLOYEE", "DEPARTMENT_MANAGER", "PROJECT_MANAGER"]),
    );

    const [userId, roles] = updateUserRoles.mock.calls[0]!;
    expect(userId).toBe(OTHER);
    expect([...roles].sort()).toEqual([
      "DEPARTMENT_MANAGER",
      "EMPLOYEE",
      "PROJECT_MANAGER",
    ]);
    expect(state.error).toBeUndefined();
    expect(state.done).toContain("Access roles updated");
  });

  it("sends nothing but roles", async () => {
    await updateUserRolesAction(EMPTY_ROLE_STATE, form(OTHER, ["EMPLOYEE"]));

    const [, roles] = updateUserRoles.mock.calls[0]!;
    // The call signature carries an id and a role list — no identity or
    // organization fields can ride along.
    expect(updateUserRoles.mock.calls[0]).toHaveLength(2);
    expect(Array.isArray(roles)).toBe(true);
  });

  it("refreshes People, the person, and Home", async () => {
    await updateUserRolesAction(EMPTY_ROLE_STATE, form(OTHER, ["EMPLOYEE"]));

    for (const path of ["/people", `/people/${OTHER}`, "/home"]) {
      expect(revalidatePath).toHaveBeenCalledWith(path);
    }
  });
});

describe("the trust boundary", () => {
  async function expectRejected(formData: FormData) {
    const state = await updateUserRolesAction(EMPTY_ROLE_STATE, formData);
    expect(updateUserRoles).not.toHaveBeenCalled();
    return state;
  }

  it("refuses a session without the organization-admin role, before reading anything", async () => {
    resolveProductSession.mockResolvedValue({
      authenticated: true,
      user: { userId: ME, roles: ["EMPLOYEE", "DEPARTMENT_MANAGER"] },
    });

    await expectRejected(form(OTHER, ["EMPLOYEE"]));
    expect(getOrganizationUsers).not.toHaveBeenCalled();
  });

  it("refuses anything that is not an identifier", async () => {
    for (const userId of ["", "../users", "not-a-uuid", "1 OR 1=1"]) {
      await expectRejected(form(userId, ["EMPLOYEE"]));
    }
  });

  it("drops SYSTEM_ADMIN before the backend is asked", async () => {
    await updateUserRolesAction(
      EMPTY_ROLE_STATE,
      form(OTHER, ["EMPLOYEE", "SYSTEM_ADMIN", "PROJECT_MANAGER"]),
    );

    const [, roles] = updateUserRoles.mock.calls[0]!;
    expect(roles).not.toContain("SYSTEM_ADMIN");
    expect([...roles].sort()).toEqual(["EMPLOYEE", "PROJECT_MANAGER"]);
  });

  it("puts Employee back even when the form omits it", async () => {
    await updateUserRolesAction(EMPTY_ROLE_STATE, form(OTHER, ["PROJECT_MANAGER"]));

    const [, roles] = updateUserRoles.mock.calls[0]!;
    expect(roles).toContain("EMPLOYEE");
  });

  it("refuses editing your own roles in an organization with other people", async () => {
    getOrganizationUser.mockResolvedValue({
      ok: true,
      value: user(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"),
    });

    const state = await expectRejected(
      form(ME, ["EMPLOYEE", "ORGANIZATION_ADMIN", "PROJECT_MANAGER"]),
    );

    expect(state.error).toContain("Another Organization Admin");
  });

  it("refuses removing the last organization admin", async () => {
    getOrganizationUsers.mockResolvedValue({
      ok: true,
      value: [user(ME, "EMPLOYEE"), user(OTHER, "EMPLOYEE", "ORGANIZATION_ADMIN")],
    });
    getOrganizationUser.mockResolvedValue({
      ok: true,
      value: user(OTHER, "EMPLOYEE", "ORGANIZATION_ADMIN"),
    });

    const state = await expectRejected(form(OTHER, ["EMPLOYEE"]));

    expect(state.error).toContain("at least one Organization Admin");
  });

  it("refuses a solo founder removing a role they hold", async () => {
    getOrganizationUsers.mockResolvedValue({
      ok: true,
      value: [user(ME, "EMPLOYEE", "ORGANIZATION_ADMIN")],
    });
    getOrganizationUser.mockResolvedValue({
      ok: true,
      value: user(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"),
    });

    const state = await expectRejected(form(ME, ["EMPLOYEE", "PROJECT_MANAGER"]));

    expect(state.error).toContain("cannot remove your own roles");
  });

  it("derives solo status from a fresh read, not from the form", async () => {
    // The page may have been loaded when this person really was alone.
    getOrganizationUsers.mockResolvedValue({
      ok: true,
      value: [user(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"), user(OTHER, "EMPLOYEE")],
    });
    getOrganizationUser.mockResolvedValue({
      ok: true,
      value: user(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"),
    });

    const state = await expectRejected(
      form(ME, ["EMPLOYEE", "ORGANIZATION_ADMIN", "PROJECT_MANAGER"]),
    );

    expect(state.error).toContain("Another Organization Admin");
  });
});

describe("the solo founder bootstrap", () => {
  beforeEach(() => {
    getOrganizationUsers.mockResolvedValue({
      ok: true,
      value: [user(ME, "EMPLOYEE", "ORGANIZATION_ADMIN")],
    });
    getOrganizationUser.mockResolvedValue({
      ok: true,
      value: user(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"),
    });
    updateUserRoles.mockResolvedValue({
      ok: true,
      value: {
        ...user(ME, "EMPLOYEE", "ORGANIZATION_ADMIN", "PROJECT_MANAGER"),
        createdAt: null,
        updatedAt: null,
      },
    });
  });

  it("lets a founder alone in the organization add the manager roles", async () => {
    const state = await updateUserRolesAction(
      EMPTY_ROLE_STATE,
      form(ME, ["EMPLOYEE", "ORGANIZATION_ADMIN", "DEPARTMENT_MANAGER", "PROJECT_MANAGER"]),
    );

    expect(updateUserRoles).toHaveBeenCalledTimes(1);
    expect(state.error).toBeUndefined();
  });

  it("refreshes the shell, because the session's capabilities changed", async () => {
    await updateUserRolesAction(
      EMPTY_ROLE_STATE,
      form(ME, ["EMPLOYEE", "ORGANIZATION_ADMIN", "PROJECT_MANAGER"]),
    );

    // The backend rebuilds roles from the database on the next request, so
    // nothing here needs a sign-out and none is suggested.
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("still lets the backend win if a second person appeared meanwhile", async () => {
    updateUserRoles.mockResolvedValue({
      ok: false,
      status: 400,
      detail: "You cannot update your own roles.",
    });

    const state = await updateUserRolesAction(
      EMPTY_ROLE_STATE,
      form(ME, ["EMPLOYEE", "ORGANIZATION_ADMIN", "PROJECT_MANAGER"]),
    );

    expect(state.error).toBe("You cannot update your own roles.");
    expect(state.done).toBeUndefined();
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
    "/users/",
    "Exception",
    "timestamp",
  ];

  it("carries no token, header, backend path or envelope on any failure", async () => {
    for (const status of [400, 401, 403, 404, 409, 500]) {
      updateUserRoles.mockResolvedValue({ ok: false, status, detail: null });

      const serialized = JSON.stringify(
        await updateUserRolesAction(EMPTY_ROLE_STATE, form(OTHER, ["EMPLOYEE"])),
      );
      for (const leak of LEAKS) expect(serialized).not.toContain(leak);
    }
  });
});
