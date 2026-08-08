import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { getNavigationItems } from "@/shared/config/navigation";

import { AppShell } from "./AppShell";

function renderShell(roles: Parameters<typeof getNavigationItems>[0], currentItemId?: "projects") {
  return render(
    <AppShell
      organizationName="Northwind Co"
      user={{ name: "Mert Aydoğan", roles }}
      navigationItems={getNavigationItems(roles)}
      currentItemId={currentItemId}
    >
      <p>Page content</p>
    </AppShell>,
  );
}

describe("AppShell", () => {
  it("renders the navigation it is given inside a labelled nav landmark", () => {
    renderShell(["EMPLOYEE", "PROJECT_MANAGER"]);

    const nav = screen.getByRole("navigation", { name: "Product" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Home",
      "Projects",
      "Staffing",
      "Skills",
    ]);
  });

  it("does not render items the role set does not grant", () => {
    renderShell(["EMPLOYEE"]);

    const nav = screen.getByRole("navigation", { name: "Product" });
    // Absent, not disabled: a capability the user lacks should not be visible.
    expect(within(nav).queryByRole("link", { name: "Staffing" })).toBeNull();
    expect(within(nav).queryByRole("link", { name: "People" })).toBeNull();
    expect(within(nav).queryByRole("link", { name: "Organization" })).toBeNull();
  });

  it("shows the organization as context and the roles the user holds", () => {
    renderShell(["EMPLOYEE", "PROJECT_MANAGER", "DEPARTMENT_MANAGER"]);

    expect(screen.getByText("Northwind Co")).toBeInTheDocument();
    expect(screen.getByText("Mert Aydoğan")).toBeInTheDocument();
    // Roles in words, never raw enum values, and never a switcher.
    expect(
      screen.getByText("Employee · Project manager · Department manager"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("marks the current page for assistive technology, not by styling alone", () => {
    renderShell(["EMPLOYEE"], "projects");

    expect(screen.getByRole("link", { name: "Projects" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
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
