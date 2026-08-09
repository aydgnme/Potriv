import { describe, expect, it } from "vitest";

import type { AccessRole } from "@/shared/types/accessRole";

import {
  defaultView,
  grantedScopes,
  isViewGranted,
  normalizeProjectsQuery,
  projectsHref,
} from "./projectsQuery";

/**
 * The rules that decide what a person can even ask for.
 *
 * Everything here is pure, so it is the cheapest place to pin the entitlement
 * behaviour that the loader and the nav both depend on.
 */

function views(roles: readonly AccessRole[]): readonly string[] {
  return grantedScopes(roles).map((scope) => scope.view);
}

describe("grantedScopes", () => {
  it("gives an employee their own allocations and nothing else", () => {
    expect(views(["EMPLOYEE"])).toEqual(["mine"]);
  });

  it("adds managed for a project manager", () => {
    expect(views(["EMPLOYEE", "PROJECT_MANAGER"])).toEqual(["managed", "mine"]);
  });

  it("adds department for a department manager", () => {
    expect(views(["EMPLOYEE", "DEPARTMENT_MANAGER"])).toEqual(["department", "mine"]);
  });

  it("gives a project and department manager all three", () => {
    expect(views(["EMPLOYEE", "PROJECT_MANAGER", "DEPARTMENT_MANAGER"])).toEqual([
      "managed",
      "department",
      "mine",
    ]);
  });

  it("gives an organization admin no project scope of its own", () => {
    // There is no ordinary-product endpoint for an organization-wide project
    // list, so the admin role adds nothing here rather than inventing a view.
    expect(views(["EMPLOYEE", "ORGANIZATION_ADMIN"])).toEqual(["mine"]);
  });

  it("gives every ordinary role all three, in one fixed order", () => {
    const all: readonly AccessRole[] = [
      "EMPLOYEE",
      "PROJECT_MANAGER",
      "DEPARTMENT_MANAGER",
      "ORGANIZATION_ADMIN",
    ];

    expect(views(all)).toEqual(["managed", "department", "mine"]);
    // Order is a property of the scope list, not of the role list.
    expect(views([...all].reverse())).toEqual(["managed", "department", "mine"]);
  });

  it("labels the scopes for people, not for the URL", () => {
    expect(grantedScopes(["EMPLOYEE", "PROJECT_MANAGER", "DEPARTMENT_MANAGER"])).toEqual([
      { view: "managed", label: "Managed" },
      { view: "department", label: "Department" },
      { view: "mine", label: "My projects" },
    ]);
  });
});

describe("defaultView", () => {
  it("opens on managed for a project manager", () => {
    expect(defaultView(["EMPLOYEE", "PROJECT_MANAGER"])).toBe("managed");
  });

  it("opens on department for a department manager without PM", () => {
    expect(defaultView(["EMPLOYEE", "DEPARTMENT_MANAGER"])).toBe("department");
  });

  it("prefers managed when someone holds both", () => {
    expect(defaultView(["PROJECT_MANAGER", "DEPARTMENT_MANAGER"])).toBe("managed");
  });

  it("falls back to a person's own allocations", () => {
    expect(defaultView(["EMPLOYEE"])).toBe("mine");
    expect(defaultView(["EMPLOYEE", "ORGANIZATION_ADMIN"])).toBe("mine");
  });
});

describe("normalizeProjectsQuery", () => {
  it("honours a view the roles grant", () => {
    expect(normalizeProjectsQuery({ view: "mine" }, ["EMPLOYEE", "PROJECT_MANAGER"])).toEqual({
      view: "mine",
      status: null,
    });
  });

  it("falls back to the default when the view is not granted", () => {
    // An employee crafting ?view=managed gets their own default rather than an
    // attempted request the backend would refuse.
    expect(normalizeProjectsQuery({ view: "managed" }, ["EMPLOYEE"])).toEqual({
      view: "mine",
      status: null,
    });
    expect(isViewGranted("managed", ["EMPLOYEE"])).toBe(false);
  });

  it("falls back when the view is not a view at all", () => {
    for (const view of ["", "MANAGED", "all", "organization", "../admin"]) {
      expect(normalizeProjectsQuery({ view }, ["EMPLOYEE", "PROJECT_MANAGER"]).view).toBe(
        "managed",
      );
    }
  });

  it("keeps a real status", () => {
    expect(normalizeProjectsQuery({ view: "managed", status: "IN_PROGRESS" }, [
      "PROJECT_MANAGER",
    ])).toEqual({ view: "managed", status: "IN_PROGRESS" });
  });

  it("treats an unrecognised status as All rather than passing it on", () => {
    // The honest answer to a filter nobody can parse is to filter nothing — and
    // nothing arbitrary ever reaches a backend path.
    for (const status of ["", "in_progress", "DELETED", "1", "IN_PROGRESS; DROP"]) {
      expect(normalizeProjectsQuery({ view: "managed", status }, ["PROJECT_MANAGER"]).status)
        .toBeNull();
    }
  });

  it("takes the first value when a parameter is repeated", () => {
    expect(
      normalizeProjectsQuery({ view: ["mine", "managed"], status: ["CLOSED", "STARTING"] }, [
        "EMPLOYEE",
        "PROJECT_MANAGER",
      ]),
    ).toEqual({ view: "mine", status: "CLOSED" });
  });

  it("defaults an empty URL", () => {
    expect(normalizeProjectsQuery({}, ["EMPLOYEE", "DEPARTMENT_MANAGER"])).toEqual({
      view: "department",
      status: null,
    });
  });
});

describe("projectsHref", () => {
  it("carries the status across a scope change", () => {
    // Changing what you are looking at should not silently reset what you were
    // looking for.
    expect(projectsHref({ view: "department", status: "IN_PROGRESS" })).toBe(
      "/projects?view=department&status=IN_PROGRESS",
    );
  });

  it("omits the status for All", () => {
    expect(projectsHref({ view: "mine", status: null })).toBe("/projects?view=mine");
  });
});
