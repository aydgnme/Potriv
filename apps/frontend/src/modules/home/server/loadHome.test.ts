import { describe, expect, it, vi } from "vitest";

import type { AccessRole } from "@/shared/types/accessRole";

import type { ManagedProject, ProjectStaffingDetails } from "../model/homeData";
import type { HomeDataSources, Loaded } from "./homeDataSources";
import { STAFFING_ENRICHMENT_LIMIT, loadHomeData } from "./loadHome";

/**
 * Home must fetch exactly what the user's roles entitle them to — no more.
 *
 * Calling a manager endpoint for an employee and swallowing the 403 would make
 * capability depend on error handling, and would send the backend a request it
 * rightly refuses on every page load. These tests treat "was it called?" as the
 * contract.
 */

function ok<T>(value: T): Loaded<T> {
  return { ok: true, value };
}

function managedProject(id: string, status: ManagedProject["status"]): ManagedProject {
  return {
    projectId: id,
    name: `Project ${id}`,
    status,
    deadlineDate: null,
    teamRoles: [],
  };
}

const NO_STAFFING: ProjectStaffingDetails = {
  projectId: "p",
  teamRoleRequirements: [],
  activeMembers: [],
};

function sources(overrides: Partial<HomeDataSources> = {}) {
  return {
    getMyProjects: vi.fn(async () => ok({ currentProjects: [], pastProjects: [] })),
    getMySkills: vi.fn(async () => ok([])),
    getManagedProjects: vi.fn(async () => ok([])),
    getProjectStaffingDetails: vi.fn(async () => ok(NO_STAFFING)),
    getPendingDepartmentProposals: vi.fn(async () => ok([])),
    getDepartmentProjects: vi.fn(async () =>
      ok({ department: { name: "Platform" }, projects: [] }),
    ),
    getDepartments: vi.fn(async () => ok([])),
    getOrganizationUsers: vi.fn(async () => ok([])),
    getTeamRoles: vi.fn(async () => ok([])),
    getOrganizationSkills: vi.fn(async () => ok([])),
    ...overrides,
  } as unknown as HomeDataSources & Record<string, ReturnType<typeof vi.fn>>;
}

const EMPLOYEE: readonly AccessRole[] = ["EMPLOYEE"];

describe("loadHomeData — role gating", () => {
  it("loads only the shared sources for an employee", async () => {
    const deps = sources();

    const data = await loadHomeData(EMPLOYEE, deps);

    expect(deps.getMyProjects).toHaveBeenCalledTimes(1);
    expect(deps.getMySkills).toHaveBeenCalledTimes(1);

    // Not called, not called-and-ignored.
    expect(deps.getManagedProjects).not.toHaveBeenCalled();
    expect(deps.getPendingDepartmentProposals).not.toHaveBeenCalled();
    expect(deps.getDepartmentProjects).not.toHaveBeenCalled();
    expect(deps.getDepartments).not.toHaveBeenCalled();
    expect(deps.getOrganizationUsers).not.toHaveBeenCalled();
    // Setup signals are an organization-admin concern and cost nothing for
    // anybody else.
    expect(deps.getTeamRoles).not.toHaveBeenCalled();
    expect(deps.getOrganizationSkills).not.toHaveBeenCalled();

    // And nothing role-specific is even offered to the page.
    expect(data.managedProjects).toBeNull();
    expect(data.pendingProposals).toBeNull();
    expect(data.departmentProjects).toBeNull();
    expect(data.departments).toBeNull();
    expect(data.organizationUsers).toBeNull();
  });

  it("loads managed projects for a project manager and nothing else extra", async () => {
    const deps = sources();

    await loadHomeData(["EMPLOYEE", "PROJECT_MANAGER"], deps);

    expect(deps.getManagedProjects).toHaveBeenCalledTimes(1);
    expect(deps.getPendingDepartmentProposals).not.toHaveBeenCalled();
    expect(deps.getDepartments).not.toHaveBeenCalled();
    expect(deps.getOrganizationUsers).not.toHaveBeenCalled();
    // Setup signals are an organization-admin concern and cost nothing for
    // anybody else.
    expect(deps.getTeamRoles).not.toHaveBeenCalled();
    expect(deps.getOrganizationSkills).not.toHaveBeenCalled();
  });

  it("loads both department sources for a department manager", async () => {
    const deps = sources();

    await loadHomeData(["EMPLOYEE", "DEPARTMENT_MANAGER"], deps);

    expect(deps.getPendingDepartmentProposals).toHaveBeenCalledTimes(1);
    expect(deps.getDepartmentProjects).toHaveBeenCalledTimes(1);
    expect(deps.getManagedProjects).not.toHaveBeenCalled();
    expect(deps.getDepartments).not.toHaveBeenCalled();
  });

  it("loads departments and users for an organization admin", async () => {
    const deps = sources();

    await loadHomeData(["EMPLOYEE", "ORGANIZATION_ADMIN"], deps);

    expect(deps.getDepartments).toHaveBeenCalledTimes(1);
    expect(deps.getOrganizationUsers).toHaveBeenCalledTimes(1);
    expect(deps.getTeamRoles).toHaveBeenCalledTimes(1);
    expect(deps.getOrganizationSkills).toHaveBeenCalledTimes(1);
    // The org-admin role alone has no organization-wide project endpoint.
    expect(deps.getManagedProjects).not.toHaveBeenCalled();
  });

  it("unions the sources for a multi-role user, each called once", async () => {
    const deps = sources();

    await loadHomeData(
      ["EMPLOYEE", "PROJECT_MANAGER", "DEPARTMENT_MANAGER", "ORGANIZATION_ADMIN"],
      deps,
    );

    for (const source of [
      deps.getMyProjects,
      deps.getMySkills,
      deps.getManagedProjects,
      deps.getPendingDepartmentProposals,
      deps.getDepartmentProjects,
      deps.getDepartments,
      deps.getOrganizationUsers,
    ]) {
      expect(source).toHaveBeenCalledTimes(1);
    }
  });
});

describe("loadHomeData — bounded staffing enrichment", () => {
  it("looks up staffing for at most the shortlist, however many projects exist", async () => {
    const many = Array.from({ length: 40 }, (_, index) =>
      managedProject(`p${index}`, "IN_PROGRESS"),
    );
    const deps = sources({ getManagedProjects: vi.fn(async () => ok(many)) });

    const data = await loadHomeData(["EMPLOYEE", "PROJECT_MANAGER"], deps);

    // Forty projects must not become forty requests to fill a five-row panel.
    expect(deps.getProjectStaffingDetails).toHaveBeenCalledTimes(STAFFING_ENRICHMENT_LIMIT);
    expect(data.managedProjects?.ok).toBe(true);
  });

  it("enriches the projects most worth acting on first", async () => {
    const projects = [
      managedProject("closed", "CLOSED"),
      managedProject("live", "IN_PROGRESS"),
      managedProject("planned", "NOT_STARTED"),
    ];
    const deps = sources({ getManagedProjects: vi.fn(async () => ok(projects)) });

    const data = await loadHomeData(["EMPLOYEE", "PROJECT_MANAGER"], deps);

    if (!data.managedProjects?.ok) throw new Error("expected managed projects");
    expect(data.managedProjects.value[0]?.projectId).toBe("live");
  });

  it("carries the real number of open positions through, not the role count", async () => {
    const deps = sources({
      getManagedProjects: vi.fn(async () => ok([managedProject("p1", "IN_PROGRESS")])),
      getProjectStaffingDetails: vi.fn(async () =>
        ok({
          projectId: "p1",
          teamRoleRequirements: [
            { teamRole: { teamRoleId: "backend" }, requiredMembers: 3 },
          ],
          activeMembers: [{ roles: [{ teamRoleId: "backend" }] }],
        }),
      ),
    });

    const data = await loadHomeData(["EMPLOYEE", "PROJECT_MANAGER"], deps);

    if (!data.managedProjects?.ok) throw new Error("expected managed projects");
    // Two people missing, not "one understaffed role".
    expect(data.managedProjects.value[0]?.openStaffingSlots).toBe(2);
  });

  it("leaves a project unenriched rather than reporting a false zero", async () => {
    const deps = sources({
      getManagedProjects: vi.fn(async () => ok([managedProject("p1", "IN_PROGRESS")])),
      getProjectStaffingDetails: vi.fn(async () => ({ ok: false as const, reason: "ERROR" as const })),
    });

    const data = await loadHomeData(["EMPLOYEE", "PROJECT_MANAGER"], deps);

    if (!data.managedProjects?.ok) throw new Error("expected managed projects");
    // Null, not 0 — 0 would render as "Team staffed".
    expect(data.managedProjects.value[0]?.openStaffingSlots).toBeNull();
  });
});

describe("loadHomeData — partial failure", () => {
  it("keeps unrelated sections when one source fails", async () => {
    const deps = sources({
      getPendingDepartmentProposals: vi.fn(async () => ({ ok: false as const, reason: "ERROR" as const })),
    });

    const data = await loadHomeData(["EMPLOYEE", "DEPARTMENT_MANAGER"], deps);

    expect(data.pendingProposals?.ok).toBe(false);
    // One unavailable endpoint must not blank the page.
    expect(data.myProjects.ok).toBe(true);
    expect(data.mySkills.ok).toBe(true);
    expect(data.departmentProjects?.ok).toBe(true);
  });

  it("still reports the managed-projects section as failed without throwing", async () => {
    const deps = sources({ getManagedProjects: vi.fn(async () => ({ ok: false as const, reason: "ERROR" as const })) });

    const data = await loadHomeData(["EMPLOYEE", "PROJECT_MANAGER"], deps);

    expect(data.managedProjects?.ok).toBe(false);
    expect(data.myProjects.ok).toBe(true);
    // No point loading details for a list that never arrived.
    expect(deps.getProjectStaffingDetails).not.toHaveBeenCalled();
  });
});
