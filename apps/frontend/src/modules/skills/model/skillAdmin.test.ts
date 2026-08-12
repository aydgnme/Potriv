import { describe, expect, it } from "vitest";

import {
  CATEGORY_NAME_MAX,
  SKILL_DESCRIPTION_MAX,
  SKILL_NAME_MAX,
  activeCategories,
  linkActionFor,
  skillAdminCapabilities,
  validateCategoryName,
  validateSkillForm,
} from "./skillAdmin";
import type { CatalogueSkill, SkillCategory } from "./skillsData";

/**
 * The three authorities catalogue administration rests on.
 *
 * They are separate on purpose: the role lets somebody author, authorship lets
 * them change what they wrote, and an actual appointment lets them say their
 * department uses a skill. Flattening any two of them would hand each the reach
 * of the wider one.
 */

const BACKEND = "3e38e3cc-140c-4b89-a51d-a184c6e85700";
const RETIRED = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const ANA = "0f7d1c62-4b0e-4a6f-9d2a-7c1b8e5f3a10";
const BOB = "9f8e7d6c-5b4a-4392-8172-6a5b4c3d2e1f";
const PLATFORM = "686fcfea-14c7-493f-9c7a-2aa31267723a";
const QA = "c817dc97-3552-49c9-ab27-a47a790deb57";

function category(categoryId: string, name: string, active = true): SkillCategory {
  return {
    categoryId,
    name,
    active,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  };
}

function skill(overrides: Partial<CatalogueSkill> = {}): CatalogueSkill {
  return {
    skillId: "s-1",
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

describe("category names", () => {
  it("rejects blank and whitespace-only", () => {
    for (const raw of ["", "   ", "\t"]) {
      expect(validateCategoryName(raw).ok).toBe(false);
    }
  });

  it("accepts exactly the maximum and rejects one more", () => {
    expect(validateCategoryName("x".repeat(CATEGORY_NAME_MAX)).ok).toBe(true);
    expect(validateCategoryName("x".repeat(CATEGORY_NAME_MAX + 1)).ok).toBe(false);
  });

  it("trims, and counts length after trimming", () => {
    expect(validateCategoryName("  Backend  ")).toEqual({ ok: true, name: "Backend" });
    expect(validateCategoryName(`  ${"x".repeat(CATEGORY_NAME_MAX)}  `).ok).toBe(true);
  });

  it("leaves case alone", () => {
    // Uniqueness is compared lowercased; the display value is not.
    expect(validateCategoryName("BACKEND")).toEqual({ ok: true, name: "BACKEND" });
  });
});

describe("skill fields", () => {
  it("requires a category that is at least an identifier", () => {
    for (const categoryId of ["", "not-a-uuid", "../categories"]) {
      const result = validateSkillForm(categoryId, "Java", "");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.categoryId).toBeDefined();
    }
  });

  it("accepts the maximum name and description, and rejects one more", () => {
    expect(validateSkillForm(BACKEND, "x".repeat(SKILL_NAME_MAX), "").ok).toBe(true);
    expect(validateSkillForm(BACKEND, "x".repeat(SKILL_NAME_MAX + 1), "").ok).toBe(false);

    expect(validateSkillForm(BACKEND, "Java", "y".repeat(SKILL_DESCRIPTION_MAX)).ok).toBe(true);
    expect(validateSkillForm(BACKEND, "Java", "y".repeat(SKILL_DESCRIPTION_MAX + 1)).ok).toBe(
      false,
    );
  });

  it("turns a blank description into null rather than an empty string", () => {
    // An empty string would render as a description that exists and says nothing.
    const result = validateSkillForm(BACKEND, "Java", "   ");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.values.description).toBeNull();
  });

  it("trims both text fields", () => {
    const result = validateSkillForm(BACKEND, "  Java  ", "  The language.  ");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.values.name).toBe("Java");
      expect(result.values.description).toBe("The language.");
    }
  });

  it("reports every problem at once", () => {
    const result = validateSkillForm("nope", "", "y".repeat(SKILL_DESCRIPTION_MAX + 1));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.categoryId).toBeDefined();
      expect(result.errors.name).toBeDefined();
      expect(result.errors.description).toBeDefined();
    }
  });
});

describe("which categories may take a skill", () => {
  it("offers only active ones", () => {
    // The backend refuses a skill in a retired category.
    const result = activeCategories([
      category(BACKEND, "Backend"),
      category(RETIRED, "Retired", false),
    ]);

    expect(result.map((entry) => entry.name)).toEqual(["Backend"]);
  });
});

describe("what a department manager may do", () => {
  const asManager = (overrides: Partial<Parameters<typeof skillAdminCapabilities>[0]> = {}) =>
    skillAdminCapabilities({
      skill: skill(),
      currentUserId: ANA,
      roles: ["EMPLOYEE", "DEPARTMENT_MANAGER"],
      managedDepartment: null,
      ...overrides,
    });

  it("lets any manager author catalogue entries", () => {
    // Including one who manages no department.
    expect(asManager().canAuthorCatalogue).toBe(true);
    expect(asManager({ currentUserId: BOB }).canAuthorCatalogue).toBe(true);
  });

  it("gives nobody without the role anything", () => {
    const employee = skillAdminCapabilities({
      skill: skill(),
      currentUserId: ANA,
      roles: ["EMPLOYEE", "ORGANIZATION_ADMIN"],
      managedDepartment: { departmentId: PLATFORM, name: "Platform" },
    });

    expect(employee.canAuthorCatalogue).toBe(false);
    expect(employee.canEditContent).toBe(false);
    // Not even a department, whatever the appointment says.
    expect(employee.managedDepartment).toBeNull();
  });

  it("lets only the author change the content", () => {
    expect(asManager().canEditContent).toBe(true);
    expect(asManager({ currentUserId: BOB }).canEditContent).toBe(false);
  });

  it("keeps authorship and appointment independent", () => {
    // Somebody else's skill, but this manager runs a department.
    const other = asManager({
      currentUserId: BOB,
      managedDepartment: { departmentId: PLATFORM, name: "Platform" },
    });

    expect(other.canEditContent).toBe(false);
    expect(other.managedDepartment?.name).toBe("Platform");
  });

  it("notices when the managed department is already linked", () => {
    const linked = asManager({
      skill: skill({ departments: [{ departmentId: PLATFORM, name: "Platform" }] }),
      managedDepartment: { departmentId: PLATFORM, name: "Platform" },
    });

    expect(linked.linkedToManagedDepartment).toBe(true);
  });

  it("does not count another department's link as its own", () => {
    const linkedElsewhere = asManager({
      skill: skill({ departments: [{ departmentId: QA, name: "QA" }] }),
      managedDepartment: { departmentId: PLATFORM, name: "Platform" },
    });

    expect(linkedElsewhere.linkedToManagedDepartment).toBe(false);
  });
});

describe("which link control to offer", () => {
  const capabilitiesFor = (target: CatalogueSkill, department: string | null) =>
    skillAdminCapabilities({
      skill: target,
      currentUserId: BOB,
      roles: ["EMPLOYEE", "DEPARTMENT_MANAGER"],
      managedDepartment: department ? { departmentId: department, name: "Platform" } : null,
    });

  it("offers nothing to a manager with no department", () => {
    const target = skill();
    expect(linkActionFor(target, capabilitiesFor(target, null))).toBe("none");
  });

  it("offers a link on an active unlinked skill", () => {
    const target = skill();
    expect(linkActionFor(target, capabilitiesFor(target, PLATFORM))).toBe("link");
  });

  it("offers an unlink once it is linked", () => {
    const target = skill({ departments: [{ departmentId: PLATFORM, name: "Platform" }] });
    expect(linkActionFor(target, capabilitiesFor(target, PLATFORM))).toBe("unlink");
  });

  it("offers no new link on a retired skill", () => {
    // The backend refuses it, so there is no control rather than one that fails.
    const target = skill({ active: false });
    expect(linkActionFor(target, capabilitiesFor(target, PLATFORM))).toBe("none");
  });

  it("still offers unlink on a retired skill that is linked", () => {
    // Retiring a skill must not trap a department in a relationship it cannot end.
    const target = skill({
      active: false,
      departments: [{ departmentId: PLATFORM, name: "Platform" }],
    });

    expect(linkActionFor(target, capabilitiesFor(target, PLATFORM))).toBe("unlink");
  });

  it("offers a link even when another department already has one", () => {
    const target = skill({ departments: [{ departmentId: QA, name: "QA" }] });
    expect(linkActionFor(target, capabilitiesFor(target, PLATFORM))).toBe("link");
  });
});
