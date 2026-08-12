import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_TEAM_ROLE_STATE } from "../../model/teamRoleActionState";

/**
 * Team-role administration, from the outside.
 *
 * Organization-admin work. A project manager may read the catalogue — they need
 * it to say what a project requires — but reading it is not administering it, and
 * the difference is asserted rather than assumed.
 *
 * Deactivation is soft in both directions, and nothing here touches an access
 * role: a team role says what a project needs staffed and grants nobody anything.
 */

const resolveProductSession = vi.fn();
const getTeamRole = vi.fn();
const getTeamRoles = vi.fn();
const createTeamRole = vi.fn();
const updateTeamRole = vi.fn();
const deactivateTeamRole = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/modules/auth/server/productSession", () => ({ resolveProductSession }));
vi.mock("../teamRoleDataSources", () => ({
  getTeamRole,
  getTeamRoles,
  createTeamRole,
  updateTeamRole,
  deactivateTeamRole,
}));
vi.mock("next/cache", () => ({ revalidatePath }));

const actions = await import("./teamRoleActions");

const ROLE = "3e38e3cc-140c-4b89-a51d-a184c6e85700";

function teamRole(overrides: Record<string, unknown> = {}) {
  return {
    teamRoleId: ROLE,
    name: "Backend Engineer",
    description: "Builds the services.",
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    ...overrides,
  };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const VALID = { name: "Backend Engineer", description: "Builds the services." };

beforeEach(() => {
  vi.clearAllMocks();
  resolveProductSession.mockResolvedValue({
    authenticated: true,
    user: { userId: "oa-1", roles: ["EMPLOYEE", "ORGANIZATION_ADMIN"] },
  });
  getTeamRole.mockResolvedValue({ ok: true, value: teamRole() });
  createTeamRole.mockResolvedValue({ ok: true, value: teamRole() });
  updateTeamRole.mockResolvedValue({ ok: true, value: teamRole() });
  deactivateTeamRole.mockResolvedValue({ ok: true, value: undefined });
});

describe("creating", () => {
  it("sends the trimmed name and description", async () => {
    await actions.createTeamRoleAction(
      EMPTY_TEAM_ROLE_STATE,
      form({ name: "  Backend Engineer  ", description: "  Builds the services.  " }),
    );

    expect(createTeamRole).toHaveBeenCalledWith("Backend Engineer", "Builds the services.");
  });

  it("turns a blank description into null", async () => {
    await actions.createTeamRoleAction(
      EMPTY_TEAM_ROLE_STATE,
      form({ name: "Backend Engineer", description: "   " }),
    );

    expect(createTeamRole).toHaveBeenCalledWith("Backend Engineer", null);
  });

  it("refuses a blank name without asking the backend", async () => {
    const state = await actions.createTeamRoleAction(
      EMPTY_TEAM_ROLE_STATE,
      form({ name: "  ", description: "" }),
    );

    expect(createTeamRole).not.toHaveBeenCalled();
    expect(state.fieldErrors?.name).toBeDefined();
  });

  it("holds the name to 120 and the description to 1000", async () => {
    const longName = await actions.createTeamRoleAction(
      EMPTY_TEAM_ROLE_STATE,
      form({ name: "x".repeat(121), description: "" }),
    );
    expect(longName.fieldErrors?.name).toBeDefined();

    const longDescription = await actions.createTeamRoleAction(
      EMPTY_TEAM_ROLE_STATE,
      form({ name: "Backend Engineer", description: "y".repeat(1001) }),
    );
    expect(longDescription.fieldErrors?.description).toBeDefined();

    expect(createTeamRole).not.toHaveBeenCalled();
  });

  it("accepts exactly the maximums", async () => {
    await actions.createTeamRoleAction(
      EMPTY_TEAM_ROLE_STATE,
      form({ name: "x".repeat(120), description: "y".repeat(1000) }),
    );

    expect(createTeamRole).toHaveBeenCalled();
  });

  it("keeps the entered values on a duplicate", async () => {
    createTeamRole.mockResolvedValue({
      ok: false,
      status: 409,
      detail: "A team role with this name already exists in the organization.",
    });

    const state = await actions.createTeamRoleAction(
      EMPTY_TEAM_ROLE_STATE,
      form({ name: "backend engineer", description: "x" }),
    );

    expect(state.error).toContain("already exists");
    expect(state.name).toBe("backend engineer");
    expect(state.description).toBe("x");
  });

  it("tells Projects to re-read the catalogue", async () => {
    await actions.createTeamRoleAction(EMPTY_TEAM_ROLE_STATE, form(VALID));

    expect(revalidatePath).toHaveBeenCalledWith("/organization/team-roles");
    expect(revalidatePath).toHaveBeenCalledWith("/projects");
  });
});

describe("editing", () => {
  it("sends only the two editable fields", async () => {
    await actions.updateTeamRoleAction(
      EMPTY_TEAM_ROLE_STATE,
      form({ teamRoleId: ROLE, ...VALID }),
    );

    const [, changes] = updateTeamRole.mock.calls[0]!;
    expect(changes).toEqual({ name: "Backend Engineer", description: "Builds the services." });
    // An edit must never carry a state change along with it.
    expect(changes).not.toHaveProperty("active");
  });

  it("refuses an id that is not an identifier", async () => {
    for (const teamRoleId of ["", "not-a-uuid", "../team-roles"]) {
      vi.clearAllMocks();
      await actions.updateTeamRoleAction(
        EMPTY_TEAM_ROLE_STATE,
        form({ teamRoleId, ...VALID }),
      );
      expect(updateTeamRole).not.toHaveBeenCalled();
    }
  });
});

describe("retiring and restoring", () => {
  it("retires softly, and says what survives", async () => {
    const state = await actions.deactivateTeamRoleAction(
      EMPTY_TEAM_ROLE_STATE,
      form({ teamRoleId: ROLE }),
    );

    expect(deactivateTeamRole).toHaveBeenCalledWith(ROLE);
    expect(state.done).toContain("Projects that already require it are unchanged");
    expect(state.done).not.toMatch(/deleted|removed/i);
  });

  it("restores with the flag alone", async () => {
    await actions.reactivateTeamRoleAction(EMPTY_TEAM_ROLE_STATE, form({ teamRoleId: ROLE }));

    expect(updateTeamRole).toHaveBeenCalledWith(ROLE, { active: true });
  });

  it("gives one answer for a role that is missing or not visible", async () => {
    for (const reason of ["NOT_FOUND", "FORBIDDEN"]) {
      vi.clearAllMocks();
      getTeamRole.mockResolvedValue({ ok: false, reason });

      const state = await actions.deactivateTeamRoleAction(
        EMPTY_TEAM_ROLE_STATE,
        form({ teamRoleId: ROLE }),
      );

      expect(state.error).toBe("This team role does not exist or is not visible to you.");
      expect(deactivateTeamRole).not.toHaveBeenCalled();
    }
  });
});

describe("the authority matrix", () => {
  const managementDenied = async () => {
    await actions.createTeamRoleAction(EMPTY_TEAM_ROLE_STATE, form(VALID));
    await actions.updateTeamRoleAction(
      EMPTY_TEAM_ROLE_STATE,
      form({ teamRoleId: ROLE, ...VALID }),
    );
    await actions.deactivateTeamRoleAction(EMPTY_TEAM_ROLE_STATE, form({ teamRoleId: ROLE }));
    await actions.reactivateTeamRoleAction(EMPTY_TEAM_ROLE_STATE, form({ teamRoleId: ROLE }));

    expect(createTeamRole).not.toHaveBeenCalled();
    expect(updateTeamRole).not.toHaveBeenCalled();
    expect(deactivateTeamRole).not.toHaveBeenCalled();
    expect(getTeamRole).not.toHaveBeenCalled();
  };

  it("allows an organization admin", async () => {
    await actions.createTeamRoleAction(EMPTY_TEAM_ROLE_STATE, form(VALID));
    expect(createTeamRole).toHaveBeenCalled();
  });

  it("allows an admin who is also a project manager", async () => {
    resolveProductSession.mockResolvedValue({
      authenticated: true,
      user: { userId: "u-1", roles: ["EMPLOYEE", "ORGANIZATION_ADMIN", "PROJECT_MANAGER"] },
    });

    await actions.createTeamRoleAction(EMPTY_TEAM_ROLE_STATE, form(VALID));
    expect(createTeamRole).toHaveBeenCalled();
  });

  it("denies a project manager, who may still read the catalogue elsewhere", async () => {
    resolveProductSession.mockResolvedValue({
      authenticated: true,
      user: { userId: "pm-1", roles: ["EMPLOYEE", "PROJECT_MANAGER"] },
    });

    await managementDenied();
  });

  it("denies a department manager", async () => {
    resolveProductSession.mockResolvedValue({
      authenticated: true,
      user: { userId: "dm-1", roles: ["EMPLOYEE", "DEPARTMENT_MANAGER"] },
    });

    await managementDenied();
  });

  it("denies a plain employee", async () => {
    resolveProductSession.mockResolvedValue({
      authenticated: true,
      user: { userId: "e-1", roles: ["EMPLOYEE"] },
    });

    await managementDenied();
  });

  it("denies an expired session", async () => {
    resolveProductSession.mockResolvedValue({ authenticated: false });

    await managementDenied();
  });
});

describe("a team role is not an access role", () => {
  it("exposes nothing that could change what somebody may do", async () => {
    // Structural: the module's whole data-source surface.
    const sources = await vi.importActual<Record<string, unknown>>("../teamRoleDataSources");
    const exported = Object.keys(sources).filter((name) => typeof sources[name] === "function");

    expect(exported.sort()).toEqual([
      "createTeamRole",
      "deactivateTeamRole",
      "getTeamRole",
      "getTeamRoles",
      "updateTeamRole",
    ]);
    for (const name of exported) {
      expect(name.toLowerCase()).not.toContain("accessrole");
      expect(name.toLowerCase()).not.toContain("permission");
    }
  });

  it("never mentions permissions in what it tells the browser", async () => {
    const states = [
      await actions.createTeamRoleAction(EMPTY_TEAM_ROLE_STATE, form(VALID)),
      await actions.deactivateTeamRoleAction(EMPTY_TEAM_ROLE_STATE, form({ teamRoleId: ROLE })),
      await actions.reactivateTeamRoleAction(EMPTY_TEAM_ROLE_STATE, form({ teamRoleId: ROLE })),
    ];

    for (const state of states) {
      const serialized = JSON.stringify(state);
      for (const forbidden of ["EMPLOYEE", "ORGANIZATION_ADMIN", "PROJECT_MANAGER", "access role"]) {
        expect(serialized).not.toContain(forbidden);
      }
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
    "/team-roles/",
    "Exception",
    "timestamp",
  ];

  it("carries no token, header, backend path or envelope on any failure", async () => {
    for (const status of [400, 401, 403, 404, 409, 500]) {
      createTeamRole.mockResolvedValue({ ok: false, status, detail: null });
      updateTeamRole.mockResolvedValue({ ok: false, status, detail: null });
      deactivateTeamRole.mockResolvedValue({ ok: false, status, detail: null });

      for (const state of [
        await actions.createTeamRoleAction(EMPTY_TEAM_ROLE_STATE, form(VALID)),
        await actions.updateTeamRoleAction(
          EMPTY_TEAM_ROLE_STATE,
          form({ teamRoleId: ROLE, ...VALID }),
        ),
        await actions.deactivateTeamRoleAction(EMPTY_TEAM_ROLE_STATE, form({ teamRoleId: ROLE })),
        await actions.reactivateTeamRoleAction(EMPTY_TEAM_ROLE_STATE, form({ teamRoleId: ROLE })),
      ]) {
        const serialized = JSON.stringify(state);
        for (const leak of LEAKS) expect(serialized).not.toContain(leak);
      }
    }
  });
});
