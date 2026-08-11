import { describe, expect, it } from "vitest";

import type { AccessRole } from "@/shared/types/accessRole";

import {
  DEPARTMENT_NAME_MAX,
  validateDepartmentName,
} from "./departmentForm";
import { blockerMessage, deletionBlockers } from "./deletability";
import { checkManagerAssignment, managerChoices } from "./managerChoices";
import type { Department, OrganizationMember } from "./organizationData";

/**
 * The rules the Organization area is built on, checked without a backend.
 *
 * Two of them carry most of the weight: a manager is appointed to exactly one
 * department, and a department that still has dependencies cannot be deleted —
 * with the honest caveat that this product can only see two of those
 * dependencies.
 */

function department(
  departmentId: string,
  name: string,
  manager: Department["manager"] = null,
  memberCount = 0,
): Department {
  return {
    departmentId,
    name,
    manager,
    memberCount,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  };
}

function member(userId: string, name: string, ...roles: AccessRole[]): OrganizationMember {
  return { userId, name, email: `${name.toLowerCase()}@potriv.test`, roles };
}

function managerOf(user: OrganizationMember) {
  return { userId: user.userId, name: user.name, email: user.email };
}

describe("department names", () => {
  it("rejects blank and whitespace-only", () => {
    for (const raw of ["", "   ", "\t", "\n "]) {
      const result = validateDepartmentName(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.name).toBeDefined();
    }
  });

  it("accepts one character and exactly the maximum", () => {
    expect(validateDepartmentName("A")).toEqual({ ok: true, name: "A" });

    const longest = "x".repeat(DEPARTMENT_NAME_MAX);
    expect(validateDepartmentName(longest)).toEqual({ ok: true, name: longest });
  });

  it("rejects one character past the maximum", () => {
    const result = validateDepartmentName("x".repeat(DEPARTMENT_NAME_MAX + 1));
    expect(result.ok).toBe(false);
  });

  it("trims, matching what the backend stores", () => {
    expect(validateDepartmentName("  Platform Engineering  ")).toEqual({
      ok: true,
      name: "Platform Engineering",
    });
  });

  it("leaves case alone", () => {
    // Uniqueness is compared lowercased; the display value is not.
    expect(validateDepartmentName("Platform")).toEqual({ ok: true, name: "Platform" });
    expect(validateDepartmentName("PLATFORM")).toEqual({ ok: true, name: "PLATFORM" });
  });

  it("counts length after trimming, not before", () => {
    const padded = `  ${"x".repeat(DEPARTMENT_NAME_MAX)}  `;
    expect(validateDepartmentName(padded).ok).toBe(true);
  });
});

describe("who can manage a department", () => {
  const ana = member("u-ana", "Ana", "EMPLOYEE", "DEPARTMENT_MANAGER");
  const bob = member("u-bob", "Bob", "EMPLOYEE");
  const cara = member("u-cara", "Cara", "EMPLOYEE", "DEPARTMENT_MANAGER");

  const platform = department("d-platform", "Platform", managerOf(ana), 4);
  const qa = department("d-qa", "QA", managerOf(cara), 0);

  const choices = () =>
    managerChoices({
      departmentId: "d-platform",
      users: [ana, bob, cara],
      departments: [platform, qa],
    });

  it("offers only people holding the Department Manager role", () => {
    // Bob is an employee. Appointing him would need a role change, which is a
    // different decision on a different screen.
    expect(choices().choices.map((choice) => choice.userId)).toEqual(["u-ana", "u-cara"]);
  });

  it("marks the current manager as current, and leaves them selectable", () => {
    const ananChoice = choices().choices.find((choice) => choice.userId === "u-ana");
    expect(ananChoice?.current).toBe(true);
    expect(ananChoice?.unavailable).toBe(false);
  });

  it("marks somebody managing elsewhere unavailable, and says where", () => {
    const caraChoice = choices().choices.find((choice) => choice.userId === "u-cara");
    expect(caraChoice?.unavailable).toBe(true);
    expect(caraChoice?.managesInstead).toBe("QA");
  });

  it("offers an unappointed manager freely", () => {
    const dana = member("u-dana", "Dana", "EMPLOYEE", "DEPARTMENT_MANAGER");
    const result = managerChoices({
      departmentId: "d-platform",
      users: [ana, dana],
      departments: [platform],
    });

    const danaChoice = result.choices.find((choice) => choice.userId === "u-dana");
    expect(danaChoice?.unavailable).toBe(false);
    expect(danaChoice?.current).toBe(false);
  });

  it("reports that nobody is eligible, which is a different problem", () => {
    const result = managerChoices({
      departmentId: "d-platform",
      users: [bob],
      departments: [platform],
    });

    expect(result.noneEligible).toBe(true);
    expect(result.choices).toEqual([]);
  });

  it("does not call an empty organization eligible-but-none", () => {
    const result = managerChoices({ departmentId: "d-platform", users: [], departments: [] });
    expect(result.noneEligible).toBe(true);
  });
});

describe("checking an appointment before sending it", () => {
  const ana = member("u-ana", "Ana", "EMPLOYEE", "DEPARTMENT_MANAGER");
  const bob = member("u-bob", "Bob", "EMPLOYEE");
  const cara = member("u-cara", "Cara", "EMPLOYEE", "DEPARTMENT_MANAGER");

  const platform = department("d-platform", "Platform", managerOf(ana), 4);
  const qa = department("d-qa", "QA", managerOf(cara), 0);

  const choices = managerChoices({
    departmentId: "d-platform",
    users: [ana, bob, cara],
    departments: [platform, qa],
  });

  it("allows re-appointing the current manager", () => {
    // The backend treats it as idempotent, so the screen must not invent a rule.
    expect(checkManagerAssignment(choices, "u-ana")).toEqual({ ok: true });
  });

  it("refuses somebody without the role", () => {
    const result = checkManagerAssignment(choices, "u-bob");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("Department Manager role");
  });

  it("refuses somebody managing another department, and names it", () => {
    const result = checkManagerAssignment(choices, "u-cara");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("QA");
  });

  it("refuses a stranger", () => {
    expect(checkManagerAssignment(choices, "u-nobody").ok).toBe(false);
  });

  it("allows replacing one eligible manager with another", () => {
    const dana = member("u-dana", "Dana", "EMPLOYEE", "DEPARTMENT_MANAGER");
    const replacement = managerChoices({
      departmentId: "d-platform",
      users: [ana, dana],
      departments: [platform],
    });

    expect(checkManagerAssignment(replacement, "u-dana")).toEqual({ ok: true });
  });
});

describe("what stops a department being deleted", () => {
  const ana = member("u-ana", "Ana", "EMPLOYEE", "DEPARTMENT_MANAGER");

  it("reports a manager, and who has to go first", () => {
    const blockers = deletionBlockers(department("d1", "Platform", managerOf(ana), 0));

    expect(blockers).toHaveLength(1);
    expect(blockerMessage(blockers[0]!)).toContain("Ana");
    expect(blockerMessage(blockers[0]!)).toContain("Remove the manager first");
  });

  it("reports members, counted exactly", () => {
    const blockers = deletionBlockers(department("d1", "Platform", null, 4));

    expect(blockers).toHaveLength(1);
    expect(blockerMessage(blockers[0]!)).toContain("4 people");
  });

  it("says person, not people, for one", () => {
    const blockers = deletionBlockers(department("d1", "Platform", null, 1));
    expect(blockerMessage(blockers[0]!)).toContain("1 person");
  });

  it("reports both when both hold it", () => {
    const blockers = deletionBlockers(department("d1", "Platform", managerOf(ana), 2));
    expect(blockers.map((blocker) => blocker.kind)).toEqual(["manager", "members"]);
  });

  it("finds nothing to report on a clean department", () => {
    // Which is not a promise that deletion will succeed — other modules register
    // guards this product cannot see.
    expect(deletionBlockers(department("d1", "Platform", null, 0))).toEqual([]);
  });
});
