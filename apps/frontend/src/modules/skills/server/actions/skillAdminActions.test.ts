import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_SKILL_ADMIN_STATE } from "../../model/skillsActionState";

/**
 * Catalogue administration, from the outside.
 *
 * Three authorities, and the tests keep them apart deliberately:
 *
 * - the **role** lets somebody author categories and skills;
 * - **authorship** — re-read every time — lets them change what they wrote, and
 *   another manager's tampered form must fail before anything is written;
 * - an actual manager **appointment** lets them say their department uses a
 *   skill, whoever wrote it, and the department is never taken from the form.
 */

const resolveProductSession = vi.fn();
const getSkill = vi.fn();
const getSkillCategories = vi.fn();
const getManagedDepartment = vi.fn();
const createSkillCategory = vi.fn();
const updateSkillCategory = vi.fn();
const deactivateSkillCategory = vi.fn();
const createCatalogueSkill = vi.fn();
const updateCatalogueSkill = vi.fn();
const deactivateCatalogueSkill = vi.fn();
const linkSkillToCurrentDepartment = vi.fn();
const unlinkSkillFromCurrentDepartment = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/modules/auth/server/productSession", () => ({ resolveProductSession }));
vi.mock("../skillsDataSources", () => ({
  getSkill,
  getSkillCategories,
  getManagedDepartment,
  createSkillCategory,
  updateSkillCategory,
  deactivateSkillCategory,
  createCatalogueSkill,
  updateCatalogueSkill,
  deactivateCatalogueSkill,
  linkSkillToCurrentDepartment,
  unlinkSkillFromCurrentDepartment,
}));
vi.mock("next/cache", () => ({ revalidatePath }));

const actions = await import("./skillAdminActions");

const BACKEND = "3e38e3cc-140c-4b89-a51d-a184c6e85700";
const RETIRED_CATEGORY = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const JAVA = "9f8e7d6c-5b4a-4392-8172-6a5b4c3d2e1f";
const ANA = "0f7d1c62-4b0e-4a6f-9d2a-7c1b8e5f3a10";
const BOB = "686fcfea-14c7-493f-9c7a-2aa31267723a";
const PLATFORM = "c817dc97-3552-49c9-ab27-a47a790deb57";

function category(categoryId: string, name: string, active = true) {
  return {
    categoryId,
    name,
    active,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  };
}

function skill(overrides: Record<string, unknown> = {}) {
  return {
    skillId: JAVA,
    category: { categoryId: BACKEND, name: "Backend" },
    name: "Java",
    description: null,
    author: { userId: ANA, name: "Ana", email: "ana@potriv.test" },
    departments: [],
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

/** Ana: department manager, author of Java, manages Platform. */
function asAna() {
  resolveProductSession.mockResolvedValue({
    authenticated: true,
    user: { userId: ANA, roles: ["EMPLOYEE", "DEPARTMENT_MANAGER"] },
  });
}

/** Bob: department manager, author of nothing here. */
function asBob() {
  resolveProductSession.mockResolvedValue({
    authenticated: true,
    user: { userId: BOB, roles: ["EMPLOYEE", "DEPARTMENT_MANAGER"] },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  asAna();
  getSkill.mockResolvedValue({ ok: true, value: skill() });
  getSkillCategories.mockResolvedValue({ ok: true, value: [category(BACKEND, "Backend")] });
  getManagedDepartment.mockResolvedValue({
    ok: true,
    value: { departmentId: PLATFORM, name: "Platform" },
  });
  createSkillCategory.mockResolvedValue({ ok: true, value: category("c-new", "Design") });
  updateSkillCategory.mockResolvedValue({ ok: true, value: category(BACKEND, "Backend") });
  deactivateSkillCategory.mockResolvedValue({ ok: true, value: undefined });
  createCatalogueSkill.mockResolvedValue({ ok: true, value: skill() });
  updateCatalogueSkill.mockResolvedValue({ ok: true, value: skill() });
  deactivateCatalogueSkill.mockResolvedValue({ ok: true, value: undefined });
  linkSkillToCurrentDepartment.mockResolvedValue({ ok: true, value: undefined });
  unlinkSkillFromCurrentDepartment.mockResolvedValue({ ok: true, value: undefined });
});

describe("categories", () => {
  it("creates from the trimmed name", async () => {
    await actions.createSkillCategoryAction(EMPTY_SKILL_ADMIN_STATE, form({ name: "  Design  " }));

    expect(createSkillCategory).toHaveBeenCalledWith("Design");
  });

  it("refuses a blank name without asking the backend", async () => {
    const state = await actions.createSkillCategoryAction(
      EMPTY_SKILL_ADMIN_STATE,
      form({ name: "  " }),
    );

    expect(createSkillCategory).not.toHaveBeenCalled();
    expect(state.fieldErrors?.name).toBeDefined();
  });

  it("keeps the entered value on a duplicate", async () => {
    createSkillCategory.mockResolvedValue({
      ok: false,
      status: 409,
      detail: "A skill category with this name already exists in the organization.",
    });

    const state = await actions.createSkillCategoryAction(
      EMPTY_SKILL_ADMIN_STATE,
      form({ name: "backend" }),
    );

    expect(state.error).toContain("already exists");
    expect(state.name).toBe("backend");
  });

  it("renames without touching the state", async () => {
    await actions.updateSkillCategoryAction(
      EMPTY_SKILL_ADMIN_STATE,
      form({ categoryId: BACKEND, name: "Platform Backend" }),
    );

    expect(updateSkillCategory).toHaveBeenCalledWith(BACKEND, { name: "Platform Backend" });
  });

  it("retires without cascading into its skills", async () => {
    const state = await actions.deactivateSkillCategoryAction(
      EMPTY_SKILL_ADMIN_STATE,
      form({ categoryId: BACKEND }),
    );

    expect(deactivateSkillCategory).toHaveBeenCalledWith(BACKEND);
    // Nothing here touches a skill, a link or an assignment.
    expect(deactivateCatalogueSkill).not.toHaveBeenCalled();
    expect(updateCatalogueSkill).not.toHaveBeenCalled();
    expect(unlinkSkillFromCurrentDepartment).not.toHaveBeenCalled();
    expect(state.done).toContain("skills are unchanged");
  });

  it("restores with the flag alone", async () => {
    await actions.reactivateSkillCategoryAction(
      EMPTY_SKILL_ADMIN_STATE,
      form({ categoryId: BACKEND }),
    );

    expect(updateSkillCategory).toHaveBeenCalledWith(BACKEND, { active: true });
  });

  it("refuses everything to somebody without the role, before any read", async () => {
    resolveProductSession.mockResolvedValue({
      authenticated: true,
      user: { userId: ANA, roles: ["EMPLOYEE", "ORGANIZATION_ADMIN"] },
    });

    await actions.createSkillCategoryAction(EMPTY_SKILL_ADMIN_STATE, form({ name: "Design" }));
    await actions.updateSkillCategoryAction(
      EMPTY_SKILL_ADMIN_STATE,
      form({ categoryId: BACKEND, name: "Design" }),
    );
    await actions.deactivateSkillCategoryAction(
      EMPTY_SKILL_ADMIN_STATE,
      form({ categoryId: BACKEND }),
    );
    await actions.reactivateSkillCategoryAction(
      EMPTY_SKILL_ADMIN_STATE,
      form({ categoryId: BACKEND }),
    );

    expect(createSkillCategory).not.toHaveBeenCalled();
    expect(updateSkillCategory).not.toHaveBeenCalled();
    expect(deactivateSkillCategory).not.toHaveBeenCalled();
  });

  it("refuses a category id that is not an identifier", async () => {
    for (const categoryId of ["", "not-a-uuid", "../categories"]) {
      vi.clearAllMocks();
      asAna();

      await actions.deactivateSkillCategoryAction(
        EMPTY_SKILL_ADMIN_STATE,
        form({ categoryId }),
      );
      expect(deactivateSkillCategory).not.toHaveBeenCalled();
    }
  });
});

describe("creating a skill", () => {
  it("lets any department manager create one", async () => {
    asBob();

    await actions.createCatalogueSkillAction(
      EMPTY_SKILL_ADMIN_STATE,
      form({ categoryId: BACKEND, name: "Go", description: "" }),
    );

    expect(createCatalogueSkill).toHaveBeenCalledWith(BACKEND, "Go", null);
  });

  it("sends no author, organization or state", async () => {
    await actions.createCatalogueSkillAction(
      EMPTY_SKILL_ADMIN_STATE,
      form({ categoryId: BACKEND, name: "Go", description: "Fast." }),
    );

    // The call signature is category, name, description — nothing else can ride
    // along, and the backend decides the author.
    expect(createCatalogueSkill.mock.calls[0]).toEqual([BACKEND, "Go", "Fast."]);
  });

  it("refuses a retired category", async () => {
    getSkillCategories.mockResolvedValue({
      ok: true,
      value: [category(RETIRED_CATEGORY, "Retired", false)],
    });

    const state = await actions.createCatalogueSkillAction(
      EMPTY_SKILL_ADMIN_STATE,
      form({ categoryId: RETIRED_CATEGORY, name: "Go", description: "" }),
    );

    expect(createCatalogueSkill).not.toHaveBeenCalled();
    expect(state.error).toContain("active category");
  });

  it("refuses a category this organization does not have", async () => {
    const state = await actions.createCatalogueSkillAction(
      EMPTY_SKILL_ADMIN_STATE,
      form({ categoryId: RETIRED_CATEGORY, name: "Go", description: "" }),
    );

    expect(createCatalogueSkill).not.toHaveBeenCalled();
    expect(state.error).toContain("does not exist or is not visible");
  });

  it("keeps the values on a duplicate, which is per category", async () => {
    createCatalogueSkill.mockResolvedValue({
      ok: false,
      status: 409,
      detail: "A skill with this name already exists in this category.",
    });

    const state = await actions.createCatalogueSkillAction(
      EMPTY_SKILL_ADMIN_STATE,
      form({ categoryId: BACKEND, name: "java", description: "x" }),
    );

    expect(state.error).toContain("already exists in this category");
    expect(state.name).toBe("java");
    expect(state.categoryId).toBe(BACKEND);
    expect(state.description).toBe("x");
  });
});

describe("authorship decides content", () => {
  it("lets the author edit, retire and restore", async () => {
    await actions.updateCatalogueSkillAction(
      EMPTY_SKILL_ADMIN_STATE,
      form({ skillId: JAVA, categoryId: BACKEND, name: "Java SE", description: "" }),
    );
    await actions.deactivateCatalogueSkillAction(EMPTY_SKILL_ADMIN_STATE, form({ skillId: JAVA }));
    await actions.reactivateCatalogueSkillAction(EMPTY_SKILL_ADMIN_STATE, form({ skillId: JAVA }));

    expect(updateCatalogueSkill).toHaveBeenCalledWith(JAVA, {
      categoryId: BACKEND,
      name: "Java SE",
      description: null,
    });
    expect(deactivateCatalogueSkill).toHaveBeenCalledWith(JAVA);
    expect(updateCatalogueSkill).toHaveBeenCalledWith(JAVA, { active: true });
  });

  it("refuses another manager, however the form was edited", async () => {
    // Bob holds the role and can read the skill; the hidden Edit button is not
    // what stops him.
    asBob();

    const edit = await actions.updateCatalogueSkillAction(
      EMPTY_SKILL_ADMIN_STATE,
      form({ skillId: JAVA, categoryId: BACKEND, name: "Bob's Java", description: "" }),
    );
    const retire = await actions.deactivateCatalogueSkillAction(
      EMPTY_SKILL_ADMIN_STATE,
      form({ skillId: JAVA }),
    );
    const restore = await actions.reactivateCatalogueSkillAction(
      EMPTY_SKILL_ADMIN_STATE,
      form({ skillId: JAVA }),
    );

    expect(updateCatalogueSkill).not.toHaveBeenCalled();
    expect(deactivateCatalogueSkill).not.toHaveBeenCalled();
    for (const state of [edit, retire, restore]) {
      expect(state.error).toBe("Only the person who added this skill can change it.");
    }
  });

  it("re-reads the author rather than trusting the page", async () => {
    // The skill changed hands, or the page was never theirs.
    getSkill.mockResolvedValue({ ok: true, value: skill({ author: { userId: BOB, name: "Bob", email: "bob@potriv.test" } }) });

    await actions.deactivateCatalogueSkillAction(EMPTY_SKILL_ADMIN_STATE, form({ skillId: JAVA }));

    expect(getSkill).toHaveBeenCalledWith(JAVA);
    expect(deactivateCatalogueSkill).not.toHaveBeenCalled();
  });

  it("gives one answer for a skill that is missing or not visible", async () => {
    for (const reason of ["NOT_FOUND", "FORBIDDEN"]) {
      vi.clearAllMocks();
      asAna();
      getSkill.mockResolvedValue({ ok: false, reason });

      const state = await actions.deactivateCatalogueSkillAction(
        EMPTY_SKILL_ADMIN_STATE,
        form({ skillId: JAVA }),
      );

      expect(state.error).toBe("This skill does not exist or is not visible to you.");
      expect(deactivateCatalogueSkill).not.toHaveBeenCalled();
    }
  });

  it("never lets an edit carry a state change", async () => {
    await actions.updateCatalogueSkillAction(
      EMPTY_SKILL_ADMIN_STATE,
      form({ skillId: JAVA, categoryId: BACKEND, name: "Java", description: "" }),
    );

    const [, changes] = updateCatalogueSkill.mock.calls[0]!;
    expect(changes).not.toHaveProperty("active");
  });
});

describe("department links follow the appointment", () => {
  it("links without ever naming a department", async () => {
    await actions.linkSkillToCurrentDepartmentAction(
      EMPTY_SKILL_ADMIN_STATE,
      form({ skillId: JAVA }),
    );

    expect(linkSkillToCurrentDepartment).toHaveBeenCalledWith(JAVA);
    expect(linkSkillToCurrentDepartment.mock.calls[0]).toHaveLength(1);
  });

  it("ignores a department the browser tried to supply", async () => {
    await actions.linkSkillToCurrentDepartmentAction(
      EMPTY_SKILL_ADMIN_STATE,
      form({ skillId: JAVA, departmentId: "9999aaaa-0000-4000-8000-000000000000" }),
    );

    // The endpoint takes none; the backend resolves the caller's own.
    expect(linkSkillToCurrentDepartment).toHaveBeenCalledWith(JAVA);
  });

  it("lets a manager link somebody else's skill", async () => {
    // Link authority is the appointment, not authorship.
    asBob();

    const state = await actions.linkSkillToCurrentDepartmentAction(
      EMPTY_SKILL_ADMIN_STATE,
      form({ skillId: JAVA }),
    );

    expect(linkSkillToCurrentDepartment).toHaveBeenCalledWith(JAVA);
    expect(state.error).toBeUndefined();
  });

  it("refuses a manager with no appointment", async () => {
    getManagedDepartment.mockResolvedValue({ ok: false, reason: "FORBIDDEN" });

    const link = await actions.linkSkillToCurrentDepartmentAction(
      EMPTY_SKILL_ADMIN_STATE,
      form({ skillId: JAVA }),
    );
    const unlink = await actions.unlinkSkillFromCurrentDepartmentAction(
      EMPTY_SKILL_ADMIN_STATE,
      form({ skillId: JAVA }),
    );

    expect(linkSkillToCurrentDepartment).not.toHaveBeenCalled();
    expect(unlinkSkillFromCurrentDepartment).not.toHaveBeenCalled();
    for (const state of [link, unlink]) {
      expect(state.error).toContain("not assigned as a department manager");
    }
  });

  it("refuses a new link on a retired skill", async () => {
    getSkill.mockResolvedValue({ ok: true, value: skill({ active: false }) });

    const state = await actions.linkSkillToCurrentDepartmentAction(
      EMPTY_SKILL_ADMIN_STATE,
      form({ skillId: JAVA }),
    );

    expect(linkSkillToCurrentDepartment).not.toHaveBeenCalled();
    expect(state.error).toContain("inactive skill");
  });

  it("still unlinks a retired skill", async () => {
    // Retiring must not trap a department in a relationship it cannot end, so
    // unlink does not consult the skill's state at all.
    getSkill.mockResolvedValue({ ok: true, value: skill({ active: false }) });

    await actions.unlinkSkillFromCurrentDepartmentAction(
      EMPTY_SKILL_ADMIN_STATE,
      form({ skillId: JAVA }),
    );

    expect(unlinkSkillFromCurrentDepartment).toHaveBeenCalledWith(JAVA);
  });

  it("refuses somebody without the role, before resolving anything", async () => {
    resolveProductSession.mockResolvedValue({
      authenticated: true,
      user: { userId: ANA, roles: ["EMPLOYEE", "PROJECT_MANAGER"] },
    });

    await actions.linkSkillToCurrentDepartmentAction(
      EMPTY_SKILL_ADMIN_STATE,
      form({ skillId: JAVA }),
    );

    expect(getManagedDepartment).not.toHaveBeenCalled();
    expect(linkSkillToCurrentDepartment).not.toHaveBeenCalled();
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
    "/skill-categories/",
    "Exception",
    "timestamp",
  ];

  it("carries no token, header, backend path or envelope on any failure", async () => {
    for (const status of [400, 401, 403, 404, 409, 500]) {
      vi.clearAllMocks();
      asAna();
      getSkill.mockResolvedValue({ ok: true, value: skill() });
      getSkillCategories.mockResolvedValue({ ok: true, value: [category(BACKEND, "Backend")] });
      getManagedDepartment.mockResolvedValue({
        ok: true,
        value: { departmentId: PLATFORM, name: "Platform" },
      });
      for (const source of [
        createSkillCategory,
        updateSkillCategory,
        deactivateSkillCategory,
        createCatalogueSkill,
        updateCatalogueSkill,
        deactivateCatalogueSkill,
        linkSkillToCurrentDepartment,
        unlinkSkillFromCurrentDepartment,
      ]) {
        source.mockResolvedValue({ ok: false, status, detail: null });
      }

      for (const state of [
        await actions.createSkillCategoryAction(EMPTY_SKILL_ADMIN_STATE, form({ name: "Design" })),
        await actions.deactivateSkillCategoryAction(
          EMPTY_SKILL_ADMIN_STATE,
          form({ categoryId: BACKEND }),
        ),
        await actions.createCatalogueSkillAction(
          EMPTY_SKILL_ADMIN_STATE,
          form({ categoryId: BACKEND, name: "Go", description: "" }),
        ),
        await actions.deactivateCatalogueSkillAction(
          EMPTY_SKILL_ADMIN_STATE,
          form({ skillId: JAVA }),
        ),
        await actions.linkSkillToCurrentDepartmentAction(
          EMPTY_SKILL_ADMIN_STATE,
          form({ skillId: JAVA }),
        ),
        await actions.unlinkSkillFromCurrentDepartmentAction(
          EMPTY_SKILL_ADMIN_STATE,
          form({ skillId: JAVA }),
        ),
      ]) {
        const serialized = JSON.stringify(state);
        for (const leak of LEAKS) expect(serialized).not.toContain(leak);
      }
    }
  });
});
