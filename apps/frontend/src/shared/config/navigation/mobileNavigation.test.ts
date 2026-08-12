import { describe, expect, it } from "vitest";

import { getNavigationItems } from "./getNavigationItems";
import {
  MAX_BOTTOM_CONTROLS,
  navigationItemsFor,
  splitMobileNavigation,
} from "./mobileNavigation";

/** What fits in a bottom bar, and what has to be reachable another way. */

const roles = {
  employee: ["EMPLOYEE"],
  manager: ["EMPLOYEE", "PROJECT_MANAGER"],
  admin: ["EMPLOYEE", "ORGANIZATION_ADMIN"],
  everything: ["EMPLOYEE", "PROJECT_MANAGER", "DEPARTMENT_MANAGER", "ORGANIZATION_ADMIN"],
} as const;

describe("fitting navigation into a bottom bar", () => {
  it("renders everything directly when it fits", () => {
    const { tabs, overflow } = splitMobileNavigation(getNavigationItems(roles.employee));

    expect(tabs.map((item) => item.id)).toEqual(["home", "projects", "skills"]);
    expect(overflow).toEqual([]);
  });

  it("still fits at exactly the limit", () => {
    const items = getNavigationItems(roles.admin);
    const { tabs, overflow } = splitMobileNavigation(items);

    expect(items).toHaveLength(MAX_BOTTOM_CONTROLS);
    expect(tabs).toHaveLength(MAX_BOTTOM_CONTROLS);
    expect(overflow).toEqual([]);
  });

  it("keeps a slot for More once it does not", () => {
    const items = getNavigationItems(roles.everything);
    const { tabs, overflow } = splitMobileNavigation(items);

    expect(items).toHaveLength(6);
    // Four direct plus More is five controls, not six.
    expect(tabs).toHaveLength(MAX_BOTTOM_CONTROLS - 1);
    expect(tabs.map((item) => item.id)).toEqual(["home", "projects", "staffing", "people"]);
    expect(overflow.map((item) => item.id)).toEqual(["skills", "organization"]);
  });

  it("loses nothing and duplicates nothing", () => {
    const items = getNavigationItems(roles.everything);
    const { tabs, overflow } = splitMobileNavigation(items);
    const shown = [...tabs, ...overflow].map((item) => item.id);

    expect(shown).toEqual(items.map((item) => item.id));
    expect(new Set(shown).size).toBe(shown.length);
  });

  it("preserves the sidebar's order", () => {
    const items = getNavigationItems(roles.manager);
    const { tabs } = splitMobileNavigation(items);

    expect(tabs.map((item) => item.label)).toEqual(items.map((item) => item.label));
  });
});

describe("rebuilding items from ids", () => {
  it("returns the definitions for the ids it is given, in source order", () => {
    // Deliberately out of order: the definition list decides, not the caller.
    const items = navigationItemsFor(["skills", "home"]);

    expect(items.map((item) => item.id)).toEqual(["home", "skills"]);
    expect(items[0]?.href).toBe("/home");
    // The icon comes back too — it is the thing that could not cross the
    // server/client boundary, which is why ids are passed instead of items.
    expect(items[0]?.icon).toBeDefined();
    expect(items[0]?.label).toBe("Home");
  });

  it("cannot conjure an item that was not granted", () => {
    // The client boundary can only render what the server composed, so an id
    // it was never handed is simply absent.
    expect(navigationItemsFor(["home"]).map((item) => item.id)).toEqual(["home"]);
    expect(navigationItemsFor([])).toEqual([]);
  });
});
