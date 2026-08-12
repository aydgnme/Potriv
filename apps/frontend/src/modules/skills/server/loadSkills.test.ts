import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What each Skills screen is given.
 *
 * The catalogue's two-step load is the point: the category filter can only be
 * settled against categories the organization actually has, so they are fetched
 * first and the search is issued from the settled values. A malformed or unknown
 * category must never reach the backend, and the screen must never show one
 * filter while having asked for another.
 */

const getSkillCategories = vi.fn();
const getSkills = vi.fn();
const getSkill = vi.fn();
const getOwnSkills = vi.fn();
const getManagedDepartment = vi.fn();

vi.mock("./skillsDataSources", () => ({
  getSkillCategories,
  getSkills,
  getSkill,
  getOwnSkills,
  getManagedDepartment,
}));

const { loadCatalogue, loadSkillDetail, loadOwnSkills, loadManagedDepartment } =
  await import("./loadSkills");

const JAVA = "3e38e3cc-140c-4b89-a51d-a184c6e85700";
const BACKEND = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const UNKNOWN = "9f8e7d6c-5b4a-4392-8172-6a5b4c3d2e1f";

function category(categoryId: string, name: string, active = true) {
  return {
    categoryId,
    name,
    active,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  };
}

function skill(skillId: string, name: string, active = true) {
  return {
    skillId,
    category: { categoryId: BACKEND, name: "Backend" },
    name,
    description: null,
    author: { userId: "u-1", name: "Ana", email: "ana@potriv.test" },
    departments: [],
    active,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  };
}

function assignment(employeeSkillId: string, skillId: string, name: string) {
  return {
    employeeSkillId,
    skill: { skillId, name, active: true, category: { categoryId: BACKEND, name: "Backend" } },
    level: { code: "DOES", value: 3, label: "Does" },
    experience: { code: "ONE_TO_TWO_YEARS", label: "1-2 years" },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSkillCategories.mockResolvedValue({ ok: true, value: [category(BACKEND, "Backend")] });
  getSkills.mockResolvedValue({ ok: true, value: [skill(JAVA, "Java")] });
  getSkill.mockResolvedValue({ ok: true, value: skill(JAVA, "Java") });
  getOwnSkills.mockResolvedValue({ ok: true, value: [] });
});

describe("the catalogue", () => {
  it("loads categories with the mode being asked for, then searches", async () => {
    await loadCatalogue({ includeInactive: "true" });

    expect(getSkillCategories).toHaveBeenCalledWith(true);
    expect(getSkills).toHaveBeenCalledWith(expect.objectContaining({ includeInactive: true }));
  });

  it("sends a category the organization has", async () => {
    await loadCatalogue({ categoryId: BACKEND });

    expect(getSkills).toHaveBeenCalledWith(expect.objectContaining({ categoryId: BACKEND }));
  });

  it("never sends a malformed category", async () => {
    const state = await loadCatalogue({ categoryId: "not-a-uuid" });

    expect(getSkills).toHaveBeenCalledWith(expect.not.objectContaining({ categoryId: expect.anything() }));
    expect(state.kind).toBe("ready");
    if (state.kind !== "ready") return;
    expect(state.query.categoryId).toBeUndefined();
  });

  it("normalizes an unknown category away, in the query it reports too", async () => {
    // The sidebar renders from this same query, so the screen and the request
    // agree that nothing is filtered.
    const state = await loadCatalogue({ categoryId: UNKNOWN });

    expect(getSkills).toHaveBeenCalledWith(expect.not.objectContaining({ categoryId: expect.anything() }));
    if (state.kind !== "ready") throw new Error("expected ready");
    expect(state.query.categoryId).toBeUndefined();
  });

  it("passes the trimmed search to the backend", async () => {
    await loadCatalogue({ q: "  java  " });

    expect(getSkills).toHaveBeenCalledWith(expect.objectContaining({ q: "java" }));
  });

  it("omits a blank search rather than sending an empty one", async () => {
    await loadCatalogue({ q: "   " });

    expect(getSkills).toHaveBeenCalledWith(expect.not.objectContaining({ q: expect.anything() }));
  });

  it("does not search at all when the categories fail", async () => {
    // Without them nothing can honestly say what was filtered.
    getSkillCategories.mockResolvedValue({ ok: false, reason: "ERROR" });

    const state = await loadCatalogue({ categoryId: BACKEND });

    expect(state.kind).toBe("error");
    expect(getSkills).not.toHaveBeenCalled();
  });

  it("keeps the skill list's own failure separate", async () => {
    getSkills.mockResolvedValue({ ok: false, reason: "ERROR" });

    const state = await loadCatalogue({});

    expect(state.kind).toBe("ready");
    if (state.kind !== "ready") return;
    expect(state.skills.ok).toBe(false);
  });

  it("returns the backend's list untouched", async () => {
    // Ordered by category then name already; re-sorting here would diverge the
    // day the backend changes its mind.
    const ordered = [skill("s-1", "Go"), skill("s-2", "React"), skill("s-3", "TypeScript")];
    getSkills.mockResolvedValue({ ok: true, value: ordered });

    const state = await loadCatalogue({});

    if (state.kind !== "ready" || !state.skills.ok) throw new Error("expected skills");
    expect(state.skills.value.map((entry) => entry.name)).toEqual(["Go", "React", "TypeScript"]);
  });
});

describe("the skill detail", () => {
  it("asks nothing when the id is not an identifier", async () => {
    for (const skillId of ["", "../skills", "not-a-uuid"]) {
      vi.clearAllMocks();

      expect(await loadSkillDetail(skillId)).toEqual({ kind: "unavailable" });
      expect(getSkill).not.toHaveBeenCalled();
      expect(getOwnSkills).not.toHaveBeenCalled();
    }
  });

  it("gives one answer for missing and for another organization's", async () => {
    for (const reason of ["NOT_FOUND", "FORBIDDEN"]) {
      getSkill.mockResolvedValue({ ok: false, reason });

      expect(await loadSkillDetail(JAVA)).toEqual({ kind: "unavailable" });
    }
  });

  it("keeps an outage distinct from that", async () => {
    getSkill.mockResolvedValue({ ok: false, reason: "ERROR" });

    expect(await loadSkillDetail(JAVA)).toEqual({ kind: "error" });
  });

  it("shows an inactive skill rather than hiding it", async () => {
    // Inactive is a visible catalogue state, not a secret.
    getSkill.mockResolvedValue({ ok: true, value: skill(JAVA, "Java", false) });

    const state = await loadSkillDetail(JAVA);

    expect(state.kind).toBe("ready");
    if (state.kind !== "ready") return;
    expect(state.skill.active).toBe(false);
  });

  it("finds the reader's own assignment to it", async () => {
    getOwnSkills.mockResolvedValue({ ok: true, value: [assignment("es-1", JAVA, "Java")] });

    const state = await loadSkillDetail(JAVA);

    if (state.kind !== "ready") throw new Error("expected ready");
    expect(state.assignment?.employeeSkillId).toBe("es-1");
    expect(state.profileLoaded).toBe(true);
  });

  it("reports an unreadable profile as unknown, not as unassigned", async () => {
    // Guessing "not assigned" here is how an Add button creates a duplicate.
    getOwnSkills.mockResolvedValue({ ok: false, reason: "ERROR" });

    const state = await loadSkillDetail(JAVA);

    if (state.kind !== "ready") throw new Error("expected ready");
    expect(state.assignment).toBeNull();
    expect(state.profileLoaded).toBe(false);
    expect(state.skill.name).toBe("Java");
  });

  it("does not ask for the departments again", async () => {
    // They are already embedded in the detail response.
    await loadSkillDetail(JAVA);

    expect(getSkill).toHaveBeenCalledTimes(1);
    expect(getSkill).toHaveBeenCalledWith(JAVA);
  });
});

describe("the reader's own skills", () => {
  it("passes a failure through rather than reporting an empty profile", async () => {
    getOwnSkills.mockResolvedValue({ ok: false, reason: "ERROR" });

    expect(await loadOwnSkills()).toEqual({ ok: false, reason: "ERROR" });
  });
});

describe("the caller's own department appointment", () => {
  /**
   * Three answers, not two. The role is not the appointment, so "we could not
   * find out" has to stay distinct from "you have none" — otherwise an outage
   * tells somebody something untrue about their own standing.
   */
  const MANAGER = ["EMPLOYEE", "DEPARTMENT_MANAGER"];
  const PLATFORM = { departmentId: "686fcfea-14c7-493f-9c7a-2aa31267723a", name: "Platform" };

  it("reports the department when the lookup succeeds", async () => {
    getManagedDepartment.mockResolvedValue({ ok: true, value: PLATFORM });

    expect(await loadManagedDepartment(MANAGER)).toEqual({
      kind: "managed",
      department: PLATFORM,
    });
  });

  it("reads a 403 as holding the role without an appointment", async () => {
    getManagedDepartment.mockResolvedValue({ ok: false, reason: "FORBIDDEN" });

    expect(await loadManagedDepartment(MANAGER)).toEqual({ kind: "unassigned" });
  });

  it("does not turn a failed lookup into an absent appointment", async () => {
    getManagedDepartment.mockResolvedValue({ ok: false, reason: "ERROR" });

    expect(await loadManagedDepartment(MANAGER)).toEqual({ kind: "error" });
  });

  it("treats an unexpected 404 as a failure too, not as an answer", async () => {
    // Only a 403 carries the appointment meaning; nothing else is interpreted.
    getManagedDepartment.mockResolvedValue({ ok: false, reason: "NOT_FOUND" });

    expect(await loadManagedDepartment(MANAGER)).toEqual({ kind: "error" });
  });

  it("asks nothing at all for somebody without the role", async () => {
    expect(await loadManagedDepartment(["EMPLOYEE", "ORGANIZATION_ADMIN"])).toEqual({
      kind: "unassigned",
    });
    expect(getManagedDepartment).not.toHaveBeenCalled();
  });
});
