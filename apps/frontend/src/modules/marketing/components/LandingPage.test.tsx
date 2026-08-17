import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { LANDING_SECTIONS, SECURITY, WORKFLOW_STEPS } from "../landingContent";
import { LandingPage } from "./LandingPage";

/**
 * The public landing page.
 *
 * These are contracts about what a stranger meets at `/` — that it is a real
 * page rather than a redirect, that every promise in the navigation leads
 * somewhere, and that nothing on it depends on being signed in. They are
 * deliberately about structure and destinations rather than appearance: a
 * heading may be restyled freely, but it may not stop being a heading.
 */

describe("what the landing page is", () => {
  it("renders a marketing page rather than redirecting to auth", () => {
    render(<LandingPage />);

    // The h1 is the product's proposition, not a sign-in form.
    expect(
      screen.getByRole("heading", { level: 1, name: /build the right project team/i }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });

  it("exposes the page landmarks a reader navigates by", () => {
    render(<LandingPage />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("has exactly one h1, so the document has a single subject", () => {
    render(<LandingPage />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("labels every section with its own accessible name", () => {
    const { container } = render(<LandingPage />);

    // Each section is named by its heading via aria-labelledby, so a reader
    // moving between landmarks is told which one they have arrived at.
    for (const section of LANDING_SECTIONS) {
      const element = container.querySelector(`#${section.id}`) as HTMLElement | null;
      expect(element, `missing section #${section.id}`).not.toBeNull();

      const labelId = element?.getAttribute("aria-labelledby");
      expect(labelId, `#${section.id} has no accessible name`).toBeTruthy();
      expect(container.querySelector(`#${labelId}`)?.textContent).toBeTruthy();
    }

    // The desktop navigation is display:none at jsdom's width, which puts it
    // outside the accessibility tree — and a hidden element has no computed
    // accessible name, so it cannot be selected by one. Selected by attribute
    // instead: the assertion is that the markup and its labels exist.
    const nav = container.querySelector('nav[aria-label="Landing sections"]');
    expect(nav).not.toBeNull();
    expect(nav?.querySelectorAll("a")).toHaveLength(LANDING_SECTIONS.length);
  });
});

describe("where the landing page sends people", () => {
  it("points every navigation link at a section that exists on the page", () => {
    const { container } = render(<LandingPage />);

    for (const section of LANDING_SECTIONS) {
      const target = container.querySelector(`#${section.id}`);
      // A nav item promising a section that is not rendered is a dead link.
      expect(target, `missing section #${section.id}`).not.toBeNull();
    }
  });

  it("sends Sign in to the real login route", () => {
    render(<LandingPage />);

    const signIn = screen.getAllByRole("link", { name: /^sign in$/i });
    expect(signIn.length).toBeGreaterThan(0);
    for (const link of signIn) {
      expect(link).toHaveAttribute("href", "/login");
    }
  });

  /**
   * The create-workspace CTA must lead to workspace creation.
   *
   * This is the assertion that stops the button quietly becoming a link to the
   * sign-in form: a control that says "Create your workspace" and delivers a
   * password prompt is a false promise, however convenient.
   */
  it("sends every create-workspace call to action to the real route", () => {
    render(<LandingPage />);

    const ctas = screen.getAllByRole("link", { name: /create (your )?workspace/i });
    expect(ctas.length).toBeGreaterThanOrEqual(2);
    for (const cta of ctas) {
      expect(cta).toHaveAttribute("href", "/create-workspace");
      expect(cta).not.toHaveAttribute("href", "/login");
    }
  });

  it("does not invent company or legal pages in the footer", () => {
    render(<LandingPage />);

    const footer = screen.getByRole("contentinfo");
    const hrefs = within(footer)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));

    // Only in-page anchors and the login route exist today.
    for (const href of hrefs) {
      expect(href === "/login" || href?.startsWith("#")).toBe(true);
    }
  });
});

describe("what the landing page claims", () => {
  it("states the solid-versus-dashed rule in words, not only as a line style", () => {
    render(<LandingPage />);

    // Colour and dash pattern are the decoration; these sentences are the
    // meaning, so the distinction survives for a reader who sees neither.
    expect(screen.getByText(/accepted allocation is the only thing drawn as a solid line/i))
      .toBeInTheDocument();
    expect(screen.getByText(/proposal stays dashed until the owning department accepts it/i))
      .toBeInTheDocument();
  });

  it("lists all seven workflow steps, in order, as a sequence", () => {
    const { container } = render(<LandingPage />);

    // An ordered list, because the steps happen in this order — a set of cards
    // would lose that.
    const steps = container.querySelectorAll("ol > li");
    expect(steps).toHaveLength(WORKFLOW_STEPS.length);

    const rendered = [...steps].map(
      (step) => step.querySelector("h3")?.textContent ?? "",
    );
    expect(rendered).toEqual(WORKFLOW_STEPS.map((step) => step.title));
  });

  it("claims no certification it does not hold", () => {
    render(<LandingPage />);

    const page = screen.getByRole("main").textContent ?? "";
    for (const forbidden of ["SOC 2", "SOC2", "ISO 27001", "HIPAA", "PCI", "GDPR-certified"]) {
      expect(page).not.toContain(forbidden);
    }
    expect(page).toMatch(/no certifications are claimed/i);
  });

  it("renders every security statement as its own fact", () => {
    render(<LandingPage />);

    for (const fact of SECURITY.facts) {
      expect(screen.getByRole("heading", { name: fact.title })).toBeInTheDocument();
    }
  });
});

describe("the technical diagram", () => {
  it("renders as markup with an accessible name, not an image file", () => {
    const { container } = render(<LandingPage />);

    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(0);
    // No <img>, so nothing depends on a raster asset loading.
    expect(container.querySelectorAll("img")).toHaveLength(0);

    // Both the desktop and mobile variants are present in the server output;
    // CSS decides which one is shown, so no JavaScript is needed to draw either.
    const named = container.querySelectorAll('svg[role="img"]');
    expect(named.length).toBe(2);
  });

  it("describes the flow for a reader who cannot see it", () => {
    const { container } = render(<LandingPage />);

    const titles = [...container.querySelectorAll("svg title")].map((t) => t.textContent);
    expect(titles.some((t) => /how potriv staffs a project/i.test(t ?? ""))).toBe(true);

    const descriptions = [...container.querySelectorAll("svg desc")].map((d) => d.textContent);
    expect(
      descriptions.some((d) => /proposals are drawn as dashed lines/i.test(d ?? "")),
    ).toBe(true);
  });

  it("hides purely decorative marks from assistive technology", () => {
    const { container } = render(<LandingPage />);

    // Role glyphs and the closing motif say nothing the text does not.
    const decorative = container.querySelectorAll('svg[aria-hidden="true"]');
    expect(decorative.length).toBeGreaterThan(0);
  });
});

describe("the mobile menu", () => {
  it("opens and closes, and reports which it is", async () => {
    const user = userEvent.setup();
    render(<LandingPage />);

    const toggle = screen.getByRole("button", { name: /open menu/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);
    expect(screen.getByRole("button", { name: /close menu/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    await user.click(screen.getByRole("button", { name: /close menu/i }));
    expect(screen.getByRole("button", { name: /open menu/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("leaves no hidden links behind when closed", () => {
    const { container } = render(<LandingPage />);

    // Closed means unmounted, not merely invisible — otherwise Tab would walk
    // into links nobody can see.
    expect(container.querySelector("#landing-menu")).toBeNull();
  });

  it("carries the create-workspace action for small screens", async () => {
    const user = userEvent.setup();
    const { container } = render(<LandingPage />);

    await user.click(screen.getByRole("button", { name: /open menu/i }));

    const panel = container.querySelector("#landing-menu");
    expect(panel).not.toBeNull();
    const cta = within(panel as HTMLElement).getByRole("link", {
      name: /create workspace/i,
    });
    expect(cta).toHaveAttribute("href", "/create-workspace");
  });
});
