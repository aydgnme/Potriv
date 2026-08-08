import { describe, expect, it } from "vitest";

import type { AccessRole } from "@/shared/types/accessRole";
import { toProductRoles } from "@/shared/types/accessRole";

import { getNavigationItems } from "./getNavigationItems";

function labels(roles: readonly AccessRole[]): string[] {
  return getNavigationItems(roles).map((item) => item.label);
}

describe("getNavigationItems", () => {
  it("gives an employee the shared items only", () => {
    expect(labels(["EMPLOYEE"])).toEqual(["Home", "Projects", "Skills"]);
  });

  it("adds Staffing for a project manager", () => {
    expect(labels(["EMPLOYEE", "PROJECT_MANAGER"])).toEqual([
      "Home",
      "Projects",
      "Staffing",
      "Skills",
    ]);
  });

  it("adds Staffing and People for a department manager", () => {
    expect(labels(["EMPLOYEE", "DEPARTMENT_MANAGER"])).toEqual([
      "Home",
      "Projects",
      "Staffing",
      "People",
      "Skills",
    ]);
  });

  it("adds People and Organization for an organization admin, but not Staffing", () => {
    expect(labels(["EMPLOYEE", "ORGANIZATION_ADMIN"])).toEqual([
      "Home",
      "Projects",
      "People",
      "Skills",
      "Organization",
    ]);
  });

  it("unions the capabilities of a project manager who is also a department manager", () => {
    expect(labels(["EMPLOYEE", "PROJECT_MANAGER", "DEPARTMENT_MANAGER"])).toEqual([
      "Home",
      "Projects",
      "Staffing",
      "People",
      "Skills",
    ]);
  });

  it("unions all three management roles without duplicating an item", () => {
    const items = getNavigationItems([
      "EMPLOYEE",
      "ORGANIZATION_ADMIN",
      "PROJECT_MANAGER",
      "DEPARTMENT_MANAGER",
    ]);

    expect(items.map((item) => item.label)).toEqual([
      "Home",
      "Projects",
      "Staffing",
      "People",
      "Skills",
      "Organization",
    ]);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
  });

  it("shows Organization only when organization admin is held", () => {
    const withoutAdmin = labels(["EMPLOYEE", "PROJECT_MANAGER", "DEPARTMENT_MANAGER"]);
    expect(withoutAdmin).not.toContain("Organization");
  });

  it("never lets SYSTEM_ADMIN reach product navigation", () => {
    // The server can legitimately return it; the boundary drops it, so it can
    // neither add an item nor smuggle one in alongside ordinary roles.
    const fromServer = toProductRoles(["EMPLOYEE", "SYSTEM_ADMIN"]);

    expect(fromServer).toEqual(["EMPLOYEE"]);
    expect(getNavigationItems(fromServer).map((item) => item.label)).toEqual([
      "Home",
      "Projects",
      "Skills",
    ]);
  });

  it("gives a user with no roles nothing beyond the shared items", () => {
    expect(labels([])).toEqual(["Home", "Projects", "Skills"]);
  });

  it("is order-independent: the same roles in any order give the same items", () => {
    expect(labels(["DEPARTMENT_MANAGER", "EMPLOYEE", "PROJECT_MANAGER"])).toEqual(
      labels(["EMPLOYEE", "PROJECT_MANAGER", "DEPARTMENT_MANAGER"]),
    );
  });
});
