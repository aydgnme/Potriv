import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Breadcrumbs } from "./Breadcrumbs";

/**
 * Orientation at depth.
 *
 * The trail has to be the product's hierarchy, not the browser's history: a
 * reader who arrived from a bookmark has no history, and a control that quietly
 * does nothing for them is worse than none.
 */

const UUID = "0f7d1c62-4b0e-4a6f-9d2a-7c1b8e5f3a10";

describe("the trail", () => {
  it("is a labelled navigation landmark containing a list", () => {
    render(<Breadcrumbs trail={[{ label: "Skills", href: "/skills" }]} current="Java" />);

    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav).getByRole("list")).toBeInTheDocument();
  });

  it("links every ancestor and leaves the current page as text", () => {
    render(
      <Breadcrumbs
        trail={[
          { label: "Organization", href: "/organization" },
          { label: "Team roles", href: "/organization/team-roles" },
        ]}
        current="Backend Engineer"
      />,
    );

    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["Organization", "/organization"],
      ["Team roles", "/organization/team-roles"],
    ]);
    // The compact back link exists but belongs to the narrow layout, so at this
    // width it is out of the accessibility tree rather than a duplicate.
    expect(within(nav).queryByRole("link", { name: /^Back to/ })).toBeNull();

    // Where the reader already is: named, marked, and not a link.
    const current = within(nav).getByText("Backend Engineer");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current.tagName).not.toBe("A");
  });

  it("offers the nearest ancestor as a plain back link for narrow screens", () => {
    render(
      <Breadcrumbs
        trail={[
          { label: "Skills", href: "/skills" },
          { label: "Java", href: `/skills/${UUID}` },
        ]}
        current="Edit"
      />,
    );

    // A real parent route, so it works from a bookmark — not history.back().
    // `hidden` because this width shows the full trail instead; the destination
    // is what matters, and it is the same one either way.
    expect(screen.getByRole("link", { name: "Back to Java", hidden: true })).toHaveAttribute(
      "href",
      `/skills/${UUID}`,
    );
  });

  it("shows the object's name, never its identifier", () => {
    render(
      <Breadcrumbs
        trail={[
          { label: "Projects", href: "/projects" },
          { label: "Apollo", href: `/projects/${UUID}` },
        ]}
        current="Team"
      />,
    );

    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(nav.textContent).not.toContain(UUID);
    expect(within(nav).getByRole("link", { name: "Apollo" })).toBeInTheDocument();
  });

  it("renders no back link when the current page is one level down", () => {
    // Nothing above the top-level domain to go back to beyond it.
    render(<Breadcrumbs trail={[]} current="Projects" />);

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Projects")).toHaveAttribute("aria-current", "page");
  });

  it("keeps a very long object name intact rather than clipping its name", () => {
    const long = "International Platform Reliability and Data Infrastructure Engineering";
    render(
      <Breadcrumbs
        trail={[
          { label: "Organization", href: "/organization" },
          { label: "Departments", href: "/organization/departments" },
        ]}
        current={long}
      />,
    );

    // Wrapping is CSS's job; the accessible name must survive whole.
    expect(screen.getByText(long)).toHaveAttribute("aria-current", "page");
  });
});
