import { describe, expect, it, vi } from "vitest";

import type { ProjectStatus } from "@/shared/types/projectStatus";

import type {
  ManagedProject,
  MyProjectEpisode,
  ProjectStaffingDetails,
} from "../model/projectsData";
import type { ProjectsQuery } from "../model/projectsQuery";

import { DETAIL_CONCURRENCY, loadProjectsView } from "./loadProjectsView";
import type { Loaded, ProjectsDataSources } from "./projectsDataSources";

/**
 * Projects fetches exactly one scope: the one being looked at.
 *
 * Loading a hidden scope to fill a badge would mean calling a department
 * endpoint for someone reading their own allocations — and, for a role they do
 * not hold, a request the backend rightly refuses on every page load. These
 * tests treat "was it called?" as the contract.
 */

function ok<T>(value: T): Loaded<T> {
  return { ok: true, value };
}

function managedProject(id: string, status: ProjectStatus = "IN_PROGRESS"): ManagedProject {
  return {
    projectId: id,
    name: `Project ${id}`,
    status,
    period: "FIXED",
    startDate: "2026-01-01",
    deadlineDate: "2026-12-31",
  };
}

function staffing(required: number, filled: number): ProjectStaffingDetails {
  return {
    teamRoleRequirements: [{ teamRole: { teamRoleId: "backend" }, requiredMembers: required }],
    activeMembers: Array.from({ length: filled }, () => ({
      roles: [{ teamRoleId: "backend" }],
    })),
  };
}

const NO_REQUIREMENTS: ProjectStaffingDetails = {
  teamRoleRequirements: [],
  activeMembers: [],
};

function episode(
  allocationId: string,
  projectId: string,
  projectStatus: ProjectStatus,
): MyProjectEpisode {
  return {
    allocationId,
    projectId,
    projectName: `Project ${projectId}`,
    projectStatus,
    projectPeriod: "FIXED",
    startDate: "2026-01-01",
    deadlineDate: "2026-06-30",
    workHoursPerDay: 4,
    roles: [{ teamRoleId: "backend", name: "Backend" }],
    allocatedAt: "2026-01-02T09:00:00Z",
    deallocatedAt: null,
  };
}

function sources(overrides: Partial<ProjectsDataSources> = {}) {
  return {
    getManagedProjects: vi.fn(async () => ok([] as readonly ManagedProject[])),
    getDepartmentProjects: vi.fn(async () =>
      ok({ department: { departmentId: "d1", name: "Platform" }, projects: [] }),
    ),
    getMyProjects: vi.fn(async () => ok({ currentProjects: [], pastProjects: [] })),
    getProjectStaffingDetails: vi.fn(async () => ok(NO_REQUIREMENTS)),
    ...overrides,
  } as unknown as ProjectsDataSources & Record<string, ReturnType<typeof vi.fn>>;
}

function query(overrides: Partial<ProjectsQuery> = {}): ProjectsQuery {
  return { view: "managed", status: null, ...overrides };
}

describe("only the active scope is fetched", () => {
  it("calls the managed source and nothing else", async () => {
    const deps = sources();

    await loadProjectsView(query({ view: "managed" }), deps);

    expect(deps.getManagedProjects).toHaveBeenCalledTimes(1);
    expect(deps.getDepartmentProjects).not.toHaveBeenCalled();
    expect(deps.getMyProjects).not.toHaveBeenCalled();
  });

  it("calls the department source and nothing else", async () => {
    const deps = sources();

    await loadProjectsView(query({ view: "department" }), deps);

    expect(deps.getDepartmentProjects).toHaveBeenCalledTimes(1);
    expect(deps.getManagedProjects).not.toHaveBeenCalled();
    expect(deps.getMyProjects).not.toHaveBeenCalled();
    // No staffing fan-out here: the department view shows people, not gaps.
    expect(deps.getProjectStaffingDetails).not.toHaveBeenCalled();
  });

  it("calls the allocation source and nothing else", async () => {
    const deps = sources();

    await loadProjectsView(query({ view: "mine" }), deps);

    expect(deps.getMyProjects).toHaveBeenCalledTimes(1);
    expect(deps.getManagedProjects).not.toHaveBeenCalled();
    expect(deps.getDepartmentProjects).not.toHaveBeenCalled();
  });
});

describe("status filtering", () => {
  it("hands the status to the backend for managed projects", async () => {
    const deps = sources();

    await loadProjectsView(query({ view: "managed", status: "IN_PROGRESS" }), deps);

    expect(deps.getManagedProjects).toHaveBeenCalledWith("IN_PROGRESS");
  });

  it("hands the status to the backend for department projects", async () => {
    const deps = sources();

    await loadProjectsView(query({ view: "department", status: "CLOSED" }), deps);

    expect(deps.getDepartmentProjects).toHaveBeenCalledWith("CLOSED");
  });

  it("filters allocations here, because that endpoint takes no status", async () => {
    const deps = sources({
      getMyProjects: vi.fn(async () =>
        ok({
          currentProjects: [episode("a1", "p1", "IN_PROGRESS"), episode("a2", "p2", "CLOSING")],
          pastProjects: [episode("a3", "p3", "IN_PROGRESS"), episode("a4", "p4", "CLOSED")],
        }),
      ),
    });

    const result = await loadProjectsView(query({ view: "mine", status: "IN_PROGRESS" }), deps);

    if (result.view !== "mine" || !result.data.ok) throw new Error("expected my projects");
    // The grouping survives the filter: an episode does not change group
    // because of the project's status today.
    expect(result.data.value.currentProjects.map((e) => e.allocationId)).toEqual(["a1"]);
    expect(result.data.value.pastProjects.map((e) => e.allocationId)).toEqual(["a3"]);
    expect(deps.getMyProjects).toHaveBeenCalledWith();
  });
});

describe("allocation episodes", () => {
  it("keeps repeated allocations to the same project as separate rows", async () => {
    // Somebody left a project and came back. Both episodes are true, and
    // collapsing them by project id would delete part of their history.
    const deps = sources({
      getMyProjects: vi.fn(async () =>
        ok({
          currentProjects: [episode("a3", "p1", "IN_PROGRESS")],
          pastProjects: [episode("a1", "p1", "IN_PROGRESS"), episode("a2", "p1", "IN_PROGRESS")],
        }),
      ),
    });

    const result = await loadProjectsView(query({ view: "mine" }), deps);

    if (result.view !== "mine" || !result.data.ok) throw new Error("expected my projects");
    expect(result.data.value.pastProjects).toHaveLength(2);
    expect(result.data.value.currentProjects).toHaveLength(1);
    expect(result.data.value.pastProjects.map((e) => e.projectId)).toEqual(["p1", "p1"]);
  });

  it("keeps every episode of a filtered project too", async () => {
    const deps = sources({
      getMyProjects: vi.fn(async () =>
        ok({
          currentProjects: [],
          pastProjects: [episode("a1", "p1", "CLOSED"), episode("a2", "p1", "CLOSED")],
        }),
      ),
    });

    const result = await loadProjectsView(query({ view: "mine", status: "CLOSED" }), deps);

    if (result.view !== "mine" || !result.data.ok) throw new Error("expected my projects");
    expect(result.data.value.pastProjects.map((e) => e.allocationId)).toEqual(["a1", "a2"]);
  });
});

describe("department authority", () => {
  it("passes a 403 through as an authority state, not a failure", async () => {
    const deps = sources({
      getDepartmentProjects: vi.fn(async () => ({ ok: false, reason: "FORBIDDEN" }) as const),
    });

    const result = await loadProjectsView(query({ view: "department" }), deps);

    if (result.view !== "department") throw new Error("expected department");
    expect(result.data).toEqual({ ok: false, reason: "FORBIDDEN" });
  });

  it("keeps a real outage a failure", async () => {
    const deps = sources({
      getDepartmentProjects: vi.fn(async () => ({ ok: false, reason: "ERROR" }) as const),
    });

    const result = await loadProjectsView(query({ view: "department" }), deps);

    if (result.view !== "department") throw new Error("expected department");
    expect(result.data).toEqual({ ok: false, reason: "ERROR" });
  });
});

describe("managed staffing enrichment", () => {
  it("counts open positions, not understaffed role types", async () => {
    const deps = sources({
      getManagedProjects: vi.fn(async () => ok([managedProject("p1")])),
      getProjectStaffingDetails: vi.fn(async () => ok(staffing(4, 1))),
    });

    const result = await loadProjectsView(query(), deps);

    if (result.view !== "managed" || !result.data.ok) throw new Error("expected managed");
    // Four wanted, one filled: three people missing.
    expect(result.data.value[0]?.openStaffingSlots).toBe(3);
  });

  it("attempts every row in the list, not only the first few", async () => {
    const projects = Array.from({ length: 17 }, (_, index) => managedProject(`p${index}`));
    const deps = sources({
      getManagedProjects: vi.fn(async () => ok(projects)),
      getProjectStaffingDetails: vi.fn(async () => ok(staffing(2, 1))),
    });

    const result = await loadProjectsView(query(), deps);

    if (result.view !== "managed" || !result.data.ok) throw new Error("expected managed");
    expect(deps.getProjectStaffingDetails).toHaveBeenCalledTimes(17);
    // No row silently reports unknown staffing because it fell past a shortlist.
    expect(result.data.value.every((project) => project.openStaffingSlots === 1)).toBe(true);
  });

  it("never has more than DETAIL_CONCURRENCY detail requests in flight", async () => {
    // The load bound, asserted as a bound. A total call count would pass just as
    // happily against an unbounded Promise.all.
    let inFlight = 0;
    let peak = 0;

    const projects = Array.from({ length: 17 }, (_, index) => managedProject(`p${index}`));
    const deps = sources({
      getManagedProjects: vi.fn(async () => ok(projects)),
      getProjectStaffingDetails: vi.fn(async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        for (let i = 0; i < 3; i += 1) await Promise.resolve();
        inFlight -= 1;
        return ok(NO_REQUIREMENTS);
      }),
    });

    await loadProjectsView(query(), deps);

    expect(peak).toBeLessThanOrEqual(DETAIL_CONCURRENCY);
    expect(peak).toBe(DETAIL_CONCURRENCY);
    expect(DETAIL_CONCURRENCY).toBeLessThanOrEqual(5);
  });

  it("keeps the list usable when one row's detail fails", async () => {
    const deps = sources({
      getManagedProjects: vi.fn(async () =>
        ok([managedProject("A"), managedProject("B"), managedProject("C")]),
      ),
      getProjectStaffingDetails: vi.fn(async (projectId: string) =>
        projectId === "B"
          ? ({ ok: false, reason: "ERROR" } as const)
          : ok(staffing(3, 1)),
      ),
    });

    const result = await loadProjectsView(query(), deps);

    if (result.view !== "managed" || !result.data.ok) throw new Error("expected managed");
    const byId = new Map(result.data.value.map((p) => [p.projectId, p.openStaffingSlots]));

    expect(result.data.value).toHaveLength(3);
    expect(byId.get("A")).toBe(2);
    expect(byId.get("C")).toBe(2);
    // Not 0 — a failed request is not evidence of a full team.
    expect(byId.get("B")).toBeNull();
  });

  it("orders live work first and keeps the backend's order within a status", async () => {
    const deps = sources({
      getManagedProjects: vi.fn(async () =>
        ok([
          managedProject("closed", "CLOSED"),
          managedProject("live-1", "IN_PROGRESS"),
          managedProject("not-started", "NOT_STARTED"),
          managedProject("live-2", "IN_PROGRESS"),
          managedProject("starting", "STARTING"),
        ]),
      ),
    });

    const result = await loadProjectsView(query(), deps);

    if (result.view !== "managed" || !result.data.ok) throw new Error("expected managed");
    expect(result.data.value.map((p) => p.projectId)).toEqual([
      "live-1",
      "live-2",
      "starting",
      "not-started",
      "closed",
    ]);
  });

  it("does not fan out when the managed list itself failed", async () => {
    const deps = sources({
      getManagedProjects: vi.fn(async () => ({ ok: false, reason: "ERROR" }) as const),
    });

    const result = await loadProjectsView(query(), deps);

    if (result.view !== "managed") throw new Error("expected managed");
    expect(result.data).toEqual({ ok: false, reason: "ERROR" });
    expect(deps.getProjectStaffingDetails).not.toHaveBeenCalled();
  });
});
