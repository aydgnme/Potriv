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
  /**
   * The fifth control is the account sheet, always. The sidebar that normally
   * carries sign-out is not rendered at this width, so a bar that gives that
   * slot away strands the account for whatever role set happened to fit.
   */

  it.each([
    [roles.employee, 3, 0],
    [roles.manager, 4, 0],
    [roles.admin, 4, 1],
    [roles.everything, 4, 2],
  ])("splits %#: %s domains into tabs and overflow", (held, expectedTabs, expectedOverflow) => {
    const { tabs, overflow } = splitMobileNavigation(getNavigationItems(held));

    expect(tabs).toHaveLength(expectedTabs);
    expect(overflow).toHaveLength(expectedOverflow);
    // Tabs plus the ever-present account control.
    expect(tabs.length + 1).toBeLessThanOrEqual(MAX_BOTTOM_CONTROLS);
  });

  it("never fills the last slot with a domain, even when one would fit", () => {
    // Five domains could sit in five slots — and then there would be no way to
    // reach sign-out at all.
    const items = getNavigationItems(roles.admin);

    expect(items).toHaveLength(5);
    expect(splitMobileNavigation(items).tabs).toHaveLength(4);
    expect(splitMobileNavigation(items).overflow.map((item) => item.id)).toEqual([
      "organization",
    ]);
  });

  it("loses nothing and duplicates nothing, for every role set", () => {
    for (const held of Object.values(roles)) {
      const items = getNavigationItems(held);
      const { tabs, overflow } = splitMobileNavigation(items);
      const shown = [...tabs, ...overflow].map((item) => item.id);

      expect(shown).toEqual(items.map((item) => item.id));
      expect(new Set(shown).size).toBe(shown.length);
    }
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
