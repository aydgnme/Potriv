import { describe, expect, it } from "vitest";

import { getNavigationItems } from "./getNavigationItems";
import { resolveCurrentNavigationId } from "./resolveCurrentNavigationId";

/**
 * Which domain the reader is in.
 *
 * The shell had this mechanism and never connected it, so every page announced
 * no current item. Connecting it makes the matching rule load-bearing: a rule
 * that is slightly too greedy marks the wrong domain on a real route, which is
 * worse than marking none.
 */

const ALL = getNavigationItems([
  "EMPLOYEE",
  "PROJECT_MANAGER",
  "DEPARTMENT_MANAGER",
  "ORGANIZATION_ADMIN",
]);

const UUID = "0f7d1c62-4b0e-4a6f-9d2a-7c1b8e5f3a10";

describe("the current top-level domain", () => {
  it.each([
    ["/home", "home"],
    ["/projects", "projects"],
    ["/projects/new", "projects"],
    [`/projects/${UUID}`, "projects"],
    [`/projects/${UUID}/team`, "projects"],
    [`/projects/${UUID}/team-finder`, "projects"],
    [`/projects/${UUID}/edit`, "projects"],
    ["/staffing", "staffing"],
    ["/people", "people"],
    [`/people/${UUID}`, "people"],
    ["/skills", "skills"],
    ["/skills/my", "skills"],
    ["/skills/new", "skills"],
    ["/skills/categories", "skills"],
    [`/skills/${UUID}`, "skills"],
    [`/skills/${UUID}/edit`, "skills"],
    ["/organization", "organization"],
    ["/organization/departments", "organization"],
    [`/organization/departments/${UUID}`, "organization"],
    ["/organization/invite", "organization"],
    ["/organization/team-roles", "organization"],
    ["/organization/team-roles/new", "organization"],
    [`/organization/team-roles/${UUID}`, "organization"],
  ])("puts %s in %s", (pathname, expected) => {
    expect(resolveCurrentNavigationId(pathname, ALL)).toBe(expected);
  });

  it("matches whole segments, never prefixes", () => {
    // `startsWith("/projects")` would claim both of these for Projects.
    expect(resolveCurrentNavigationId("/projects-archive", ALL)).toBeUndefined();
    expect(resolveCurrentNavigationId("/peoplefinder", ALL)).toBeUndefined();
  });

  it("ignores the query string and the fragment", () => {
    // A scope or a filter selects something *inside* a domain.
    for (const path of [
      "/projects?view=mine",
      "/projects?view=department&status=CLOSED",
      "/skills?q=java#results",
    ]) {
      expect(resolveCurrentNavigationId(path, ALL)).toBe(path.startsWith("/skills") ? "skills" : "projects");
    }
  });

  it("treats a trailing slash as the same place", () => {
    expect(resolveCurrentNavigationId("/skills/", ALL)).toBe("skills");
  });

  it("marks nothing on a route the navigation does not cover", () => {
    // Honest silence: guessing the closest domain would tell the reader they
    // are somewhere they are not.
    for (const path of ["/", "/login", "/console", "/nope"]) {
      expect(resolveCurrentNavigationId(path, ALL)).toBeUndefined();
    }
  });

  it("cannot mark an item the role set never granted", () => {
    const employeeOnly = getNavigationItems(["EMPLOYEE"]);

    // The route exists; this user has no Organization item to mark.
    expect(resolveCurrentNavigationId("/organization/team-roles", employeeOnly)).toBeUndefined();
    expect(resolveCurrentNavigationId("/skills/my", employeeOnly)).toBe("skills");
  });
});
