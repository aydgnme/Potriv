import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getNavigationItems } from "@/shared/config/navigation";
import type { AccessRole } from "@/shared/types/accessRole";

import { AppShell } from "./AppShell";

/**
 * The product frame.
 *
 * The shell renders both navigation surfaces and lets CSS decide which one the
 * viewport gets, so exactly one reaches the accessibility tree in a browser.
 * jsdom applies no media queries, so both are in the DOM here and every query
 * below says which surface it means — an assertion that does not would be
 * asserting about a surface the reader cannot see.
 */

const pathname = vi.fn(() => "/home");
vi.mock("next/navigation", () => ({ usePathname: () => pathname() }));

function renderShell(roles: readonly AccessRole[], at = "/home") {
  pathname.mockReturnValue(at);

  return render(
    <AppShell
      organizationName="Northwind Co"
      user={{ name: "Mert Aydoğan", roles }}
      navigationItemIds={getNavigationItems(roles).map((item) => item.id)}
      accountActions={<button type="button">Sign out</button>}
    >
      <p>Page content</p>
    </AppShell>,
  );
}

/**
 * The persistent rail — and, at this viewport, the only exposed navigation.
 *
 * `getByRole` throws on more than one match, so this passing is itself the
 * evidence that the bottom bar is not also in the accessibility tree here.
 */
function desktopNav(): HTMLElement {
  return screen.getByRole("navigation", { name: "Product" });
}

/**
 * The bottom bar, which this viewport hides.
 *
 * jsdom applies the stylesheet but matches no media query, so the bar keeps its
 * default `display: none` and is out of the accessibility tree — exactly as it
 * is on a desktop browser. Its semantics are still worth asserting, so these
 * queries opt into hidden elements and say so.
 */
function mobileNav(): HTMLElement {
  // Positional rather than by name: an element hidden from the accessibility
  // tree has no computed accessible name to filter on.
  const navs = screen.getAllByRole("navigation", { hidden: true });
  expect(navs).toHaveLength(2);
  return navs[1]!;
}

function inBar() {
  return within(mobileNav());
}

beforeEach(() => {
  pathname.mockReturnValue("/home");
});

describe("composition", () => {
  it("renders the navigation the roles compose, inside a labelled landmark", () => {
    renderShell(["EMPLOYEE", "PROJECT_MANAGER"]);

    expect(
      within(desktopNav())
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Home", "Projects", "Staffing", "Skills"]);
  });

  it("does not render items the role set does not grant", () => {
    renderShell(["EMPLOYEE"]);

    for (const absent of ["Staffing", "People", "Organization"]) {
      expect(within(desktopNav()).queryByRole("link", { name: absent })).toBeNull();
    }
  });

  it("shows the organization as context and the roles the user holds", () => {
    renderShell(["EMPLOYEE", "PROJECT_MANAGER", "DEPARTMENT_MANAGER"]);

    expect(within(desktopNav()).getByText("Northwind Co")).toBeInTheDocument();
    expect(within(desktopNav()).getByText("Mert Aydoğan")).toBeInTheDocument();
    // Roles in words, never raw enum values, and never a switcher.
    expect(
      within(desktopNav()).getByText("Employee · Project manager · Department manager"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("renders content inside a main landmark reachable by a skip link", () => {
    renderShell(["EMPLOYEE"]);

    expect(within(screen.getByRole("main")).getByText("Page content")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute(
      "href",
      "#main",
    );
  });
});

describe("the current domain", () => {
  it("is resolved from the live pathname rather than passed in per page", () => {
    // The shell had this mechanism before and no page supplied it, so every
    // route announced nothing. Now the URL is the only input.
    renderShell(["EMPLOYEE"], "/skills/my");

    expect(within(desktopNav()).getByRole("link", { name: "Skills" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(desktopNav()).getByRole("link", { name: "Home" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it.each([
    ["/projects/9f8e/team", "Projects"],
    ["/projects/9f8e/team-finder", "Projects"],
    ["/skills/9f8e/edit", "Skills"],
    ["/organization/team-roles/9f8e", "Organization"],
    ["/projects?view=mine", "Projects"],
  ])("marks exactly one item on %s", (at, expected) => {
    renderShell(["EMPLOYEE", "PROJECT_MANAGER", "DEPARTMENT_MANAGER", "ORGANIZATION_ADMIN"], at);

    const current = within(desktopNav())
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");

    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent(expected);
  });

  it("marks nothing rather than guessing on an unrecognised route", () => {
    renderShell(["EMPLOYEE"], "/somewhere-else");

    expect(
      within(desktopNav())
        .getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page"),
    ).toEqual([]);
  });
});

describe("collapsing the desktop rail", () => {
  it("offers a real button that says what it will do", async () => {
    const user = userEvent.setup();
    renderShell(["EMPLOYEE"]);

    const toggle = within(desktopNav()).getByRole("button", { name: "Collapse navigation" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await user.click(toggle);

    expect(
      within(desktopNav()).getByRole("button", { name: "Expand navigation" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps every link's name, its current state and sign-out", async () => {
    const user = userEvent.setup();
    renderShell(["EMPLOYEE", "PROJECT_MANAGER"], "/projects");

    await user.click(within(desktopNav()).getByRole("button", { name: "Collapse navigation" }));

    // Names unchanged: collapsing is a density preference, not a reduction in
    // what the navigation says.
    expect(
      within(desktopNav())
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Home", "Projects", "Staffing", "Skills"]);
    expect(within(desktopNav()).getByRole("link", { name: "Projects" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(desktopNav()).getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    // Who is signed in is still announced, just not shown.
    expect(within(desktopNav()).getByText(/Mert Aydoğan/)).toBeInTheDocument();
  });
});

describe("the bottom bar", () => {
  /**
   * The bar is `display: none` at this viewport, so every query here opts into
   * hidden elements. That is the point: on a desktop browser exactly one of the
   * two surfaces reaches the accessibility tree, and these tests assert the
   * other one's semantics without pretending it is on screen.
   */

  it("labels every tab rather than relying on icons", () => {
    renderShell(["EMPLOYEE"]);

    expect(
      inBar()
        .getAllByRole("link", { hidden: true })
        .map((link) => link.textContent),
    ).toEqual(["Home", "Projects", "Skills"]);
  });

  it("keeps six domains inside five controls", () => {
    renderShell(["EMPLOYEE", "PROJECT_MANAGER", "DEPARTMENT_MANAGER", "ORGANIZATION_ADMIN"]);

    const inTheBarItself = (element: HTMLElement) => element.closest("dialog") === null;
    const links = inBar().getAllByRole("link", { hidden: true }).filter(inTheBarItself);
    const buttons = inBar().getAllByRole("button", { hidden: true }).filter(inTheBarItself);

    expect(links).toHaveLength(4);
    expect(buttons).toHaveLength(1);
    expect(links.length + buttons.length).toBe(5);
    expect(buttons[0]).toHaveAccessibleName(/^More/);
  });

  it("puts the overflow domains and the account in More", async () => {
    const user = userEvent.setup();
    renderShell(["EMPLOYEE", "PROJECT_MANAGER", "DEPARTMENT_MANAGER", "ORGANIZATION_ADMIN"]);

    await user.click(inBar().getByRole("button", { name: /^More/, hidden: true }));

    const sheet = screen.getByRole("dialog", { name: "More", hidden: true });
    expect(
      within(sheet)
        .getAllByRole("link", { hidden: true })
        .map((link) => link.textContent),
    ).toEqual(["Skills", "Organization"]);
    // Account identity belongs here rather than in a crowded bar.
    expect(within(sheet).getByText("Mert Aydoğan")).toBeInTheDocument();
    expect(
      within(sheet).getByRole("button", { name: "Sign out", hidden: true }),
    ).toBeInTheDocument();
  });

  it("names More by the section it is hiding, without claiming to be it", async () => {
    const user = userEvent.setup();
    renderShell(
      ["EMPLOYEE", "PROJECT_MANAGER", "DEPARTMENT_MANAGER", "ORGANIZATION_ADMIN"],
      "/organization/team-roles",
    );

    const more = inBar().getByRole("button", {
      name: "More, current section Organization",
      hidden: true,
    });
    // A button that is not the page must not claim to be the page.
    expect(more).not.toHaveAttribute("aria-current");

    await user.click(more);
    const sheet = screen.getByRole("dialog", { name: "More", hidden: true });
    expect(
      within(sheet).getByRole("link", { name: "Organization", hidden: true }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(sheet).getByRole("link", { name: "Skills", hidden: true }),
    ).not.toHaveAttribute("aria-current");
  });

  it("reflects the sheet's state on the trigger", async () => {
    const user = userEvent.setup();
    renderShell(["EMPLOYEE", "PROJECT_MANAGER", "DEPARTMENT_MANAGER", "ORGANIZATION_ADMIN"]);

    const more = inBar().getByRole("button", { name: /^More/, hidden: true });
    expect(more).toHaveAttribute("aria-expanded", "false");

    await user.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByRole("button", { name: "Close", hidden: true }));
    expect(more).toHaveAttribute("aria-expanded", "false");
  });

  it("offers no More at all when everything fits", () => {
    renderShell(["EMPLOYEE", "ORGANIZATION_ADMIN"]);

    expect(inBar().queryByRole("button", { name: /^More/, hidden: true })).toBeNull();
  });
});
