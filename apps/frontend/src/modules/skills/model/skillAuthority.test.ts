import { describe, expect, it } from "vitest";

import type { CatalogueSkill } from "./skillsData";
import {
  linkActionFor,
  skillAdminCapabilities,
  type ManagedDepartmentState,
} from "./skillAdmin";

/**
 * The four skill authorities, which are routinely confused with each other.
 *
 * ```
 * read the catalogue      every authenticated member
 * author catalogue        DEPARTMENT_MANAGER role, appointment NOT required
 * mutate a skill's content the skill's own author, and nobody else
 * link a department       DEPARTMENT_MANAGER role AND a real appointment
 * ```
 *
 * Every test here fails if someone later flattens two of them together — which
 * is the natural shape of the mistake, because "admin" feels like one thing.
 */

const AUTHOR = "dm-author";
const OTHER = "dm-other";

function skill(overrides: Partial<CatalogueSkill> = {}): CatalogueSkill {
  return {
    skillId: "s1",
    name: "Java",
    description: "The language, not the island.",
    active: true,
    category: { categoryId: "c1", name: "Backend" },
    author: { userId: AUTHOR, name: "Author Manager", email: "author@potriv.test" },
    departments: [],
    createdAt: "2026-01-05T09:00:00Z",
    updatedAt: "2026-01-05T09:00:00Z",
    ...overrides,
  };
}

const managing = (departmentId = "d1"): ManagedDepartmentState => ({
  kind: "managed",
  department: { departmentId, name: "Platform Engineering" },
});
const unassigned: ManagedDepartmentState = { kind: "unassigned" };
const lookupFailed: ManagedDepartmentState = { kind: "error" };

describe("authoring the catalogue needs the role, not an appointment", () => {
  it("lets a department manager with no department create catalogue entries", () => {
    const caps = skillAdminCapabilities({
      skill: skill(),
      currentUserId: OTHER,
      roles: ["EMPLOYEE", "DEPARTMENT_MANAGER"],
      managedDepartment: unassigned,
    });

    // Requiring an appointment here would leave a new organization unable to
    // build its vocabulary until somebody was appointed to something.
    expect(caps.canAuthorCatalogue).toBe(true);
  });

  it("gives an organization admin no skill-authoring authority on its own", () => {
    const caps = skillAdminCapabilities({
      skill: skill(),
      currentUserId: OTHER,
      roles: ["EMPLOYEE", "ORGANIZATION_ADMIN"],
      managedDepartment: unassigned,
    });

    // ORGANIZATION_ADMIN is not a universal superuser. Administering the
    // organization and owning the skill vocabulary are separate authorities.
    expect(caps.canAuthorCatalogue).toBe(false);
    expect(caps.canEditContent).toBe(false);
  });
});

describe("content mutation belongs to the author alone", () => {
  it("lets the author change their own skill", () => {
    const caps = skillAdminCapabilities({
      skill: skill(),
      currentUserId: AUTHOR,
      roles: ["DEPARTMENT_MANAGER"],
      managedDepartment: unassigned,
    });

    expect(caps.canEditContent).toBe(true);
  });

  it("refuses another department manager, however senior", () => {
    const caps = skillAdminCapabilities({
      skill: skill(),
      currentUserId: OTHER,
      roles: ["DEPARTMENT_MANAGER", "ORGANIZATION_ADMIN"],
      managedDepartment: managing(),
    });

    // Flattening every DM into a catalogue admin is the tempting simplification
    // and it is wrong: authorship is the record-level authority.
    expect(caps.canEditContent).toBe(false);
    // …while their own separate authorities are untouched.
    expect(caps.canAuthorCatalogue).toBe(true);
    expect(linkActionFor(skill(), caps)).toBe("link");
  });
});

describe("department linking needs an appointment, authorship does not help", () => {
  it("offers no link to an author who manages no department", () => {
    const caps = skillAdminCapabilities({
      skill: skill(),
      currentUserId: AUTHOR,
      roles: ["DEPARTMENT_MANAGER"],
      managedDepartment: unassigned,
    });

    expect(caps.canEditContent).toBe(true);
    expect(linkActionFor(skill(), caps)).toBe("none");
  });

  it("offers the link to an appointed manager who did not write the skill", () => {
    const caps = skillAdminCapabilities({
      skill: skill(),
      currentUserId: OTHER,
      roles: ["DEPARTMENT_MANAGER"],
      managedDepartment: managing(),
    });

    expect(caps.canEditContent).toBe(false);
    expect(linkActionFor(skill(), caps)).toBe("link");
  });

  it("fails closed when the appointment lookup failed, without claiming there is none", () => {
    const caps = skillAdminCapabilities({
      skill: skill(),
      currentUserId: OTHER,
      roles: ["DEPARTMENT_MANAGER"],
      managedDepartment: lookupFailed,
    });

    // The control is withheld, but the state stays "error" — a backend outage
    // must never assert that somebody was never appointed.
    expect(linkActionFor(skill(), caps)).toBe("none");
    expect(caps.department.kind).toBe("error");
  });

  it("grants nothing from an appointment held without the role", () => {
    const caps = skillAdminCapabilities({
      skill: skill(),
      currentUserId: OTHER,
      roles: ["EMPLOYEE"],
      managedDepartment: managing(),
    });

    expect(caps.department.kind).toBe("unassigned");
    expect(linkActionFor(skill(), caps)).toBe("none");
  });
});

describe("retiring a skill never traps a department", () => {
  const linked = skill({
    active: false,
    departments: [{ departmentId: "d1", name: "Platform Engineering" }],
  });

  it("blocks a new link on an inactive skill", () => {
    const caps = skillAdminCapabilities({
      skill: skill({ active: false }),
      currentUserId: OTHER,
      roles: ["DEPARTMENT_MANAGER"],
      managedDepartment: managing(),
    });

    expect(linkActionFor(skill({ active: false }), caps)).toBe("none");
  });

  it("still lets an existing link be removed after the skill is retired", () => {
    const caps = skillAdminCapabilities({
      skill: linked,
      currentUserId: OTHER,
      roles: ["DEPARTMENT_MANAGER"],
      managedDepartment: managing(),
    });

    // Otherwise retiring a skill would freeze every department already on it
    // into a relationship none of them could end.
    expect(linkActionFor(linked, caps)).toBe("unlink");
  });
});

describe("category retirement cannot cascade into a skill", () => {
  it("decides a skill's usability from the skill's own state, never its category's", () => {
    // `SkillCategoryRef` carries only an id and a name — a catalogue skill has
    // no view of whether its category is active. That is the contract enforcing
    // the rule: nothing in this model *can* read a category's state, so retiring
    // a category cannot reach a skill even by accident.
    const inRetiredCategory = skill({ category: { categoryId: "c-retired", name: "Legacy" } });

    const caps = skillAdminCapabilities({
      skill: inRetiredCategory,
      currentUserId: AUTHOR,
      roles: ["DEPARTMENT_MANAGER"],
      managedDepartment: managing(),
    });

    expect(inRetiredCategory.active).toBe(true);
    expect(caps.canEditContent).toBe(true);
    expect(linkActionFor(inRetiredCategory, caps)).toBe("link");
  });
});
