import { describe, expect, it, vi } from "vitest";

import type { ProjectsDataSources } from "./projectsDataSources";
import {
  loadCreateForm,
  loadProjectEditor,
  loadProjectOverview,
  loadProjectTeamView,
  ownsProject,
} from "./loadProjectViews";

/**
 * Which endpoint each screen is allowed to touch.
 *
 * The relationship-aware reads answer for anyone the backend considers related to
 * a project; the management read answers only for its owner. Asking the wrong one
 * would either leak a project or refuse a legitimate reader, so "which source was
 * called" is the contract.
 */

function ok<T>(value: T) {
  return { ok: true as const, value };
}

function sources(overrides: Partial<ProjectsDataSources> = {}) {
  return {
    getManagedProjects: vi.fn(async () => ok([])),
    getDepartmentProjects: vi.fn(async () =>
      ok({ department: { departmentId: "d1", name: "Platform" }, projects: [] }),
    ),
    getMyProjects: vi.fn(async () => ok({ currentProjects: [], pastProjects: [] })),
    getProjectStaffingDetails: vi.fn(async () =>
      ok({ teamRoleRequirements: [], activeMembers: [] }),
    ),
    getProjectDetails: vi.fn(async () => ok({ projectId: "p1" })),
    getProjectTeam: vi.fn(async () => ok({ projectId: "p1" })),
    getManagedProject: vi.fn(async () => ok({ projectId: "p1", teamRoles: [] })),
    getTeamRoleCatalogue: vi.fn(async () => ok([])),
    ...overrides,
  } as unknown as ProjectsDataSources & Record<string, ReturnType<typeof vi.fn>>;
}

describe("overview", () => {
  it("uses the relationship-aware reads, never the owner-only one", async () => {
    // A current employee is entitled to read the project but not to
    // `GET /projects/{id}`, which would answer 404 for them.
    const deps = sources();

    await loadProjectOverview("p1", deps);

    expect(deps.getProjectDetails).toHaveBeenCalledWith("p1");
    expect(deps.getProjectTeam).toHaveBeenCalledWith("p1");
    expect(deps.getManagedProject).not.toHaveBeenCalled();
  });

  it("passes an anti-leak 404 straight through", async () => {
    const deps = sources({
      getProjectDetails: vi.fn(async () => ({ ok: false, reason: "NOT_FOUND" }) as const),
    });

    const loaded = await loadProjectOverview("p1", deps);

    expect(loaded.details).toEqual({ ok: false, reason: "NOT_FOUND" });
  });

  /**
   * Two fixed requests, not one per requirement. The page needs proposals to
   * say anything truthful about staffing, and `/details` carries none.
   */
  it("costs exactly two requests however many requirements a project has", async () => {
    const deps = sources();

    await loadProjectOverview("p1", deps);

    expect(deps.getProjectDetails).toHaveBeenCalledTimes(1);
    expect(deps.getProjectTeam).toHaveBeenCalledTimes(1);
    expect(deps.getProjectStaffingDetails).not.toHaveBeenCalled();
  });

  it("keeps the details answer when only the team read failed", async () => {
    const deps = sources({
      getProjectTeam: vi.fn(async () => ({ ok: false, reason: "ERROR" }) as const),
    });

    const loaded = await loadProjectOverview("p1", deps);

    // One failed request must not discard the answer the other one gave.
    expect(loaded.details.ok).toBe(true);
    expect(loaded.team).toEqual({ ok: false, reason: "ERROR" });
  });
});

describe("team", () => {
  it("uses the team read and nothing else", async () => {
    const deps = sources();

    await loadProjectTeamView("p1", deps);

    expect(deps.getProjectTeam).toHaveBeenCalledWith("p1");
    expect(deps.getManagedProject).not.toHaveBeenCalled();
  });
});

describe("editor", () => {
  it("prefills from the management read, not from details", async () => {
    // Details is what a reader sees; a form built from it would mean something
    // different from what it saves.
    const deps = sources();

    await loadProjectEditor("p1", deps);

    expect(deps.getManagedProject).toHaveBeenCalledWith("p1");
    expect(deps.getProjectDetails).not.toHaveBeenCalled();
  });

  it("asks for inactive roles too, so an attached one can still be named", async () => {
    const deps = sources();

    await loadProjectEditor("p1", deps);

    expect(deps.getTeamRoleCatalogue).toHaveBeenCalledWith(true);
  });

  it("reports a failed catalogue rather than pretending it was empty", async () => {
    // An empty catalogue and an unavailable one mean different things: the second
    // must block saving, because saving would rebuild the requirement list.
    const deps = sources({
      getTeamRoleCatalogue: vi.fn(async () => ({ ok: false, reason: "ERROR" }) as const),
    });

    const data = await loadProjectEditor("p1", deps);

    expect(data.project.ok).toBe(true);
    expect(data.catalogue).toEqual({ ok: false, reason: "ERROR" });
  });
});

describe("create form", () => {
  it("asks only for active roles", async () => {
    // A new project cannot require a role nobody may be given.
    const deps = sources();

    await loadCreateForm(deps);

    expect(deps.getTeamRoleCatalogue).toHaveBeenCalledWith(false);
  });
});

describe("ownsProject", () => {
  it("needs the role and the project's own manager id", () => {
    expect(ownsProject(["EMPLOYEE", "PROJECT_MANAGER"], "pm-1", "pm-1")).toBe(true);
  });

  it("refuses a project manager who does not manage this project", () => {
    expect(ownsProject(["EMPLOYEE", "PROJECT_MANAGER"], "pm-2", "pm-1")).toBe(false);
  });

  it("refuses someone without the role, whatever the ids say", () => {
    expect(ownsProject(["EMPLOYEE"], "pm-1", "pm-1")).toBe(false);
    expect(ownsProject(["EMPLOYEE", "DEPARTMENT_MANAGER"], "pm-1", "pm-1")).toBe(false);
  });

  it("refuses when the project has no manager id to compare against", () => {
    expect(ownsProject(["PROJECT_MANAGER"], "pm-1", null)).toBe(false);
    expect(ownsProject(["PROJECT_MANAGER"], "pm-1", undefined)).toBe(false);
  });
});
