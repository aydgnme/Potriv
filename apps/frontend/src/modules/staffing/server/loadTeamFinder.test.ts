import { describe, expect, it, vi } from "vitest";

import type { AccessRole } from "@/shared/types/accessRole";

import type { StaffingProjectContext } from "../model/teamFinderData";
import { normalizeTeamFinderQuery } from "../model/teamFinderQuery";

import { loadTeamFinder, ownsProject } from "./loadTeamFinder";
import type { StaffingDataSources } from "./staffingDataSources";

/**
 * Who may run Team Finder, and when it is worth running at all.
 *
 * "Was the finder called?" is the contract. Calling it for someone who only
 * reads the project would send the backend a request it rightly refuses, and
 * calling it for a project with nothing to match on would spend an
 * organization-wide ranking to come back empty.
 */

const OWNER_ID = "pm-1";

function project(overrides: Partial<StaffingProjectContext> = {}): StaffingProjectContext {
  return {
    projectId: "p1",
    projectName: "Apollo",
    projectStatus: "IN_PROGRESS",
    projectPeriod: "FIXED",
    startDate: "2026-01-05",
    deadlineDate: "2026-09-30",
    projectManager: { userId: OWNER_ID, name: "Deniz Arslan", email: "deniz@potriv.test" },
    technologyStack: [{ technologyId: "t1", name: "TypeScript" }],
    teamRoleRequirements: [],
    activeMembers: [],
    ...overrides,
  };
}

function sources(overrides: Partial<StaffingDataSources> = {}) {
  return {
    getProjectContext: vi.fn(async () => ({ ok: true as const, value: project() })),
    findCandidates: vi.fn(async () => ({
      ok: true as const,
      value: {
        projectId: "p1",
        generatedAt: null,
        criteria: {
          includePartiallyAvailable: false,
          includeCloseToFinish: false,
          closeToFinishWeeks: null,
          includeUnavailable: false,
          limit: 50,
        },
        candidateCount: 0,
        candidates: [],
      },
    })),
    proposeAssignment: vi.fn(),
    getProjectProposedMembers: vi.fn(async () => ({
      ok: true as const,
      value: { proposedMembers: [] },
    })),
    ...overrides,
  } as unknown as StaffingDataSources & Record<string, ReturnType<typeof vi.fn>>;
}

const OWNER = { userId: OWNER_ID, roles: ["EMPLOYEE", "PROJECT_MANAGER"] as readonly AccessRole[] };

const NO_CRITERIA = normalizeTeamFinderQuery({});

describe("ownership gate", () => {
  it("runs the finder for the manager who owns the project", async () => {
    const deps = sources();

    const state = await loadTeamFinder("p1", NO_CRITERIA, OWNER, deps);

    expect(state.kind).toBe("ready");
    expect(deps.findCandidates).toHaveBeenCalledTimes(1);
  });

  it("does not run it for a project manager who does not own this project", async () => {
    // They may well be able to read it — as a member, say — but staffing it is
    // the owner's job, and the backend would refuse the call.
    const deps = sources();

    const state = await loadTeamFinder(
      "p1",
      NO_CRITERIA,
      { userId: "pm-2", roles: ["EMPLOYEE", "PROJECT_MANAGER"] },
      deps,
    );

    expect(state.kind).toBe("not-owner");
    expect(deps.findCandidates).not.toHaveBeenCalled();
  });

  it("does not run it for someone without the role, whatever the ids say", async () => {
    const deps = sources();

    const state = await loadTeamFinder(
      "p1",
      NO_CRITERIA,
      { userId: OWNER_ID, roles: ["EMPLOYEE"] },
      deps,
    );

    expect(state.kind).toBe("not-owner");
    expect(deps.findCandidates).not.toHaveBeenCalled();
  });

  it("reads the project before deciding anything, so an unrelated caller is refused first", async () => {
    const deps = sources({
      getProjectContext: vi.fn(async () => ({ ok: false as const, reason: "NOT_FOUND" as const })),
    });

    const state = await loadTeamFinder("p1", NO_CRITERIA, OWNER, deps);

    expect(state).toEqual({ kind: "unavailable", reason: "NOT_FOUND" });
    expect(deps.findCandidates).not.toHaveBeenCalled();
  });
});

describe("when there is nothing to match on", () => {
  it("skips the finder for a project with no technologies", async () => {
    // Matching is between the project's technologies and people's skills. With
    // none declared there is nothing to rank against.
    const deps = sources({
      getProjectContext: vi.fn(async () => ({
        ok: true as const,
        value: project({ technologyStack: [] }),
      })),
    });

    const state = await loadTeamFinder("p1", NO_CRITERIA, OWNER, deps);

    expect(state.kind).toBe("no-technologies");
    expect(deps.findCandidates).not.toHaveBeenCalled();
  });

  it("still runs for a project with no role requirements", async () => {
    // Skills match from technologies; only past-project similarity needs target
    // roles, and its absence is not an error.
    const deps = sources({
      getProjectContext: vi.fn(async () => ({
        ok: true as const,
        value: project({ teamRoleRequirements: [] }),
      })),
    });

    const state = await loadTeamFinder("p1", NO_CRITERIA, OWNER, deps);

    expect(state.kind).toBe("ready");
    expect(deps.findCandidates).toHaveBeenCalledTimes(1);
  });
});

describe("criteria reach the backend as a body", () => {
  it("sends exactly what the URL expressed, and nothing else", async () => {
    const deps = sources();

    await loadTeamFinder(
      "p1",
      normalizeTeamFinderQuery({
        includePartiallyAvailable: "true",
        includeCloseToFinish: "true",
        closeToFinishWeeks: "4",
        limit: "20",
      }),
      OWNER,
      deps,
    );

    expect(deps.findCandidates).toHaveBeenCalledWith("p1", {
      includePartiallyAvailable: true,
      includeCloseToFinish: true,
      closeToFinishWeeks: 4,
      limit: 20,
    });
  });

  it("sends an empty body when nothing was asked for", async () => {
    const deps = sources();

    await loadTeamFinder("p1", NO_CRITERIA, OWNER, deps);

    expect(deps.findCandidates).toHaveBeenCalledWith("p1", {});
  });

  it("runs the finder exactly once per render", async () => {
    const deps = sources();

    await loadTeamFinder("p1", NO_CRITERIA, OWNER, deps);

    expect(deps.findCandidates).toHaveBeenCalledTimes(1);
    expect(deps.getProjectContext).toHaveBeenCalledTimes(1);
  });
});

describe("a failed finder does not become a missing project", () => {
  it("carries the failure through with the project still loaded", async () => {
    const deps = sources({
      findCandidates: vi.fn(async () => ({ ok: false as const, reason: "ERROR" as const })),
    });

    const state = await loadTeamFinder("p1", NO_CRITERIA, OWNER, deps);

    if (state.kind !== "ready") throw new Error("expected ready");
    expect(state.result).toEqual({ ok: false, reason: "ERROR" });
    expect(state.project.projectName).toBe("Apollo");
  });
});

describe("ownsProject", () => {
  const roles: readonly AccessRole[] = ["EMPLOYEE", "PROJECT_MANAGER"];

  it("needs the role and the project's own manager id", () => {
    expect(ownsProject(roles, "pm-1", "pm-1")).toBe(true);
    expect(ownsProject(roles, "pm-2", "pm-1")).toBe(false);
    expect(ownsProject(["EMPLOYEE"], "pm-1", "pm-1")).toBe(false);
    expect(ownsProject(roles, "pm-1", null)).toBe(false);
    expect(ownsProject(roles, "pm-1", undefined)).toBe(false);
  });
});

/**
 * What the loader is allowed to ask for, and when.
 *
 * Two rules, both security-shaped: nothing sensitive is fetched before the
 * backend has confirmed this caller may see the project at all, and the cost is
 * fixed however large the project or the result set.
 */
describe("request budget and load order", () => {
  it("costs exactly two requests after ownership, whatever the project contains", async () => {
    const deps = sources({
      getProjectContext: vi.fn(async () => ({
        ok: true as const,
        value: project({
          teamRoleRequirements: [
            {
              requirementId: "r1",
              teamRole: { teamRoleId: "backend", name: "Backend", active: true },
              requiredMembers: 9,
            },
            {
              requirementId: "r2",
              teamRole: { teamRoleId: "qa", name: "QA", active: true },
              requiredMembers: 4,
            },
          ],
        }),
      })),
    });

    await loadTeamFinder("p1", normalizeTeamFinderQuery({}), {
      userId: OWNER_ID,
      roles: ["EMPLOYEE", "PROJECT_MANAGER"] as readonly AccessRole[],
    }, deps);

    // One finder POST and one team read. No per-requirement and no per-candidate
    // fan-out — thirteen required people cost nothing extra.
    expect(deps.findCandidates).toHaveBeenCalledTimes(1);
    expect(deps.getProjectProposedMembers).toHaveBeenCalledTimes(1);
  });

  it("reads nothing sensitive for a caller who cannot see the project", async () => {
    const deps = sources({
      getProjectContext: vi.fn(async () => ({ ok: false as const, reason: "NOT_FOUND" as const })),
    });

    const state = await loadTeamFinder("p1", normalizeTeamFinderQuery({}), {
      userId: OWNER_ID,
      roles: ["EMPLOYEE", "PROJECT_MANAGER"] as readonly AccessRole[],
    }, deps);

    expect(state.kind).toBe("unavailable");
    expect(deps.findCandidates).not.toHaveBeenCalled();
    expect(deps.getProjectProposedMembers).not.toHaveBeenCalled();
  });

  it("reads nothing sensitive for a reader who does not own the project", async () => {
    const deps = sources();

    const state = await loadTeamFinder("p1", normalizeTeamFinderQuery({}), {
      // Holds the role, manages a different project.
      userId: "pm-2",
      roles: ["EMPLOYEE", "PROJECT_MANAGER"] as readonly AccessRole[],
    }, deps);

    expect(state.kind).toBe("not-owner");
    expect(deps.findCandidates).not.toHaveBeenCalled();
    expect(deps.getProjectProposedMembers).not.toHaveBeenCalled();
  });

  it("keeps the finder usable when only the team read failed", async () => {
    const deps = sources({
      getProjectProposedMembers: vi.fn(async () => ({
        ok: false as const,
        reason: "ERROR" as const,
      })),
    });

    const state = await loadTeamFinder("p1", normalizeTeamFinderQuery({}), {
      userId: OWNER_ID,
      roles: ["EMPLOYEE", "PROJECT_MANAGER"] as readonly AccessRole[],
    }, deps);

    // The candidates are still true; only the proposal counts are unknown.
    expect(state.kind).toBe("ready");
    if (state.kind !== "ready") return;
    expect(state.result.ok).toBe(true);
    expect(state.proposed.ok).toBe(false);
  });

  it("keeps the composition read when only the finder failed", async () => {
    const deps = sources({
      findCandidates: vi.fn(async () => ({ ok: false as const, reason: "ERROR" as const })),
    });

    const state = await loadTeamFinder("p1", normalizeTeamFinderQuery({}), {
      userId: OWNER_ID,
      roles: ["EMPLOYEE", "PROJECT_MANAGER"] as readonly AccessRole[],
    }, deps);

    expect(state.kind).toBe("ready");
    if (state.kind !== "ready") return;
    expect(state.result.ok).toBe(false);
    expect(state.proposed.ok).toBe(true);
  });

  it("skips both when the project declares no technologies", async () => {
    const deps = sources({
      getProjectContext: vi.fn(async () => ({
        ok: true as const,
        value: project({ technologyStack: [] }),
      })),
    });

    const state = await loadTeamFinder("p1", normalizeTeamFinderQuery({}), {
      userId: OWNER_ID,
      roles: ["EMPLOYEE", "PROJECT_MANAGER"] as readonly AccessRole[],
    }, deps);

    // Nothing was searched, so nothing was asked for.
    expect(state.kind).toBe("no-technologies");
    expect(deps.findCandidates).not.toHaveBeenCalled();
    expect(deps.getProjectProposedMembers).not.toHaveBeenCalled();
  });
});
