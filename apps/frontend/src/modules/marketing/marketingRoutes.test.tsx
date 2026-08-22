import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  FINAL_CTA,
  MARKETING_ROUTES,
  PILLARS,
  ROLES,
  SECURITY,
  WORKFLOW_STEPS,
} from "./landingContent";
import { ForTeamsPage } from "./components/pages/ForTeamsPage";
import { HomePage } from "./components/pages/HomePage";
import { HowItWorksPage } from "./components/pages/HowItWorksPage";
import { ProductPage } from "./components/pages/ProductPage";
import { SecurityPage } from "./components/pages/SecurityPage";

/**
 * The public marketing architecture.
 *
 * Product, How it works, For teams and Security were four `#fragment` sections
 * on one long page while the header advertised them as four destinations. A
 * fragment cannot be linked to from elsewhere, cannot carry a title, and cannot
 * honestly be `aria-current="page"`. These lock in the split: four routes, one
 * canonical home for each body, and a landing page that stops holding all of it.
 */

const pathname = vi.fn(() => "/");
vi.mock("next/navigation", () => ({ usePathname: () => pathname() }));

beforeEach(() => {
  pathname.mockReturnValue("/");
});

const PAGES = [
  { at: "/", render: () => <HomePage />, h1: /build the right project team/i },
  { at: "/product", render: () => <ProductPage />, h1: /four things potriv keeps straight/i },
  {
    at: "/how-it-works",
    render: () => <HowItWorksPage />,
    h1: /from empty workspace to a reviewed team/i,
  },
  {
    at: "/for-teams",
    render: () => <ForTeamsPage />,
    h1: /four responsibilities, one workspace/i,
  },
  { at: "/security", render: () => <SecurityPage />, h1: /what we can state plainly/i },
] as const;

describe("every marketing route is a real page", () => {
  it.each(PAGES)("$at has one h1 naming its subject", ({ at, render: renderPage, h1 }) => {
    pathname.mockReturnValue(at);
    render(renderPage());

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: h1 })).toBeInTheDocument();
  });

  it.each(PAGES)("$at exposes the landmarks a reader navigates by", ({ at, render: r }) => {
    pathname.mockReturnValue(at);
    render(r());

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it.each(PAGES)("$at is public — no password field, no session prompt", ({ at, render: r }) => {
    pathname.mockReturnValue(at);
    render(r());

    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });
});

describe("the header and footer point at routes, not fragments", () => {
  const marketingLinks = (container: HTMLElement, within_: "banner" | "contentinfo") => {
    const region = within_ === "banner" ? screen.getByRole("banner") : screen.getByRole("contentinfo");
    void container;
    return [...region.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "");
  };

  it("exposes exactly the four marketing routes in the header nav", () => {
    const { container } = render(<HomePage />);

    const nav = container.querySelector('nav[aria-label="Marketing"]');
    expect(nav).not.toBeNull();
    const hrefs = [...(nav?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(MARKETING_ROUTES.map((route) => route.href));
  });

  it("exposes the same four routes in the footer, from the same source", () => {
    render(<HomePage />);

    const footer = screen.getByRole("contentinfo");
    const hrefs = [...footer.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    for (const route of MARKETING_ROUTES) {
      expect(hrefs).toContain(route.href);
    }
  });

  it("has no link anywhere in the header or footer that is only a fragment", () => {
    const { container } = render(<HomePage />);

    for (const region of ["banner", "contentinfo"] as const) {
      for (const href of marketingLinks(container, region)) {
        // The skip link is the one legitimate fragment, and it is not navigation.
        if (href === "#main") continue;
        expect(href.startsWith("#"), `${region} link "${href}" is a fragment`).toBe(false);
      }
    }
  });

  it("gives the wordmark the home route and the skip link the main landmark", () => {
    render(<HomePage />);

    const banner = screen.getByRole("banner");
    const wordmark = within(banner).getByRole("link", { name: "POTRIV" });
    expect(wordmark).toHaveAttribute("href", "/");

    // The wordmark used to double as `href="#main"`, which meant the only way
    // past the navigation was a link that did not say what it did.
    const skip = within(banner).getByRole("link", { name: /skip to content/i });
    expect(skip).toHaveAttribute("href", "#main");
    expect(skip).not.toBe(wordmark);
  });

  it("names the navigation for what it now is", () => {
    const { container } = render(<HomePage />);

    // Not "Landing sections": the destinations are pages.
    expect(container.querySelector('nav[aria-label="Marketing"]')).not.toBeNull();
    expect(container.querySelector('nav[aria-label="Landing sections"]')).toBeNull();
  });
});

describe("the current page is announced, not merely coloured", () => {
  it.each(MARKETING_ROUTES)("marks $href current when that is the path", (route) => {
    pathname.mockReturnValue(route.href);
    const { container } = render(<ProductPage />);

    const current = [...container.querySelectorAll('a[aria-current="page"]')].map((a) =>
      a.getAttribute("href"),
    );
    // Every navigation surface that shows the link marks it, and nothing else.
    expect(new Set(current)).toEqual(new Set([route.href]));
  });

  it("marks nothing current on the landing page", () => {
    pathname.mockReturnValue("/");
    const { container } = render(<HomePage />);

    expect(container.querySelectorAll('a[aria-current="page"]')).toHaveLength(0);
  });
});

describe("each body has exactly one canonical home", () => {
  it("puts the four pillars on Product", () => {
    pathname.mockReturnValue("/product");
    render(<ProductPage />);

    for (const pillar of PILLARS) {
      expect(screen.getByRole("heading", { name: pillar.title })).toBeInTheDocument();
      expect(screen.getByText(pillar.body)).toBeInTheDocument();
    }
  });

  it("puts all seven workflow steps, in order, on How it works", () => {
    pathname.mockReturnValue("/how-it-works");
    const { container } = render(<HowItWorksPage />);

    // An ordered list, because the steps happen in this order.
    const steps = container.querySelectorAll("ol > li");
    expect(steps).toHaveLength(WORKFLOW_STEPS.length);
    expect([...steps].map((step) => step.querySelector("h2")?.textContent)).toEqual(
      WORKFLOW_STEPS.map((step) => step.title),
    );
  });

  it("puts the four role responsibilities on For teams", () => {
    pathname.mockReturnValue("/for-teams");
    render(<ForTeamsPage />);

    for (const role of ROLES) {
      expect(screen.getByRole("heading", { name: role.title })).toBeInTheDocument();
      expect(screen.getByText(role.body)).toBeInTheDocument();
    }
  });

  it("puts every security fact on Security", () => {
    pathname.mockReturnValue("/security");
    render(<SecurityPage />);

    for (const fact of SECURITY.facts) {
      expect(screen.getByRole("heading", { name: fact.title })).toBeInTheDocument();
      expect(screen.getByText(fact.body)).toBeInTheDocument();
    }
  });

  it("no longer renders those bodies on the landing page", () => {
    pathname.mockReturnValue("/");
    render(<HomePage />);

    const main = screen.getByRole("main").textContent ?? "";
    // The previews carry headings and destinations. The bodies live on the
    // pages they belong to; two canonical copies is what the split was for.
    for (const body of [
      PILLARS[0].body,
      WORKFLOW_STEPS[0].body,
      ROLES[0].body,
      SECURITY.facts[0].body,
    ]) {
      expect(main).not.toContain(body);
    }
    expect(screen.queryByRole("heading", { name: WORKFLOW_STEPS[0].title })).toBeNull();
  });

  it("links the landing previews at the four real routes", () => {
    pathname.mockReturnValue("/");
    render(<HomePage />);

    const main = screen.getByRole("main");
    for (const route of MARKETING_ROUTES) {
      const link = within(main).getByRole("link", {
        name: new RegExp(`^read ${route.label}$`, "i"),
      });
      expect(link).toHaveAttribute("href", route.href);
    }
  });
});

describe("where the marketing pages send people", () => {
  const REAL = new Set<string>([
    "/",
    "/login",
    "/create-workspace",
    "#main",
    ...MARKETING_ROUTES.map((route) => route.href),
  ]);

  it.each(PAGES)("$at links only to destinations that exist", ({ at, render: r }) => {
    pathname.mockReturnValue(at);
    const { container } = render(r());

    for (const href of [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"))) {
      expect(REAL.has(href ?? ""), `unexpected destination "${href}"`).toBe(true);
    }
  });

  it("sends the hero's secondary action to the How it works route", () => {
    pathname.mockReturnValue("/");
    render(<HomePage />);

    // It used to be `#how-it-works`, a scroll to a section further down.
    const link = screen.getByRole("link", { name: /see how it works/i });
    expect(link).toHaveAttribute("href", "/how-it-works");
  });

  it.each(PAGES)("$at sends every create-workspace call to the real route", ({ at, render: r }) => {
    pathname.mockReturnValue(at);
    const { container } = render(r());

    /*
      Queried by attribute rather than by role: the header's create action is
      `display: none` below 640px and the mobile panel carries it instead, so at
      jsdom's width the role query would miss the very link being asserted. The
      contract is about where each one points, not which are painted.
    */
    const ctas = [...container.querySelectorAll("a")].filter((a) =>
      /create (your )?workspace/i.test(a.textContent ?? ""),
    );
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) {
      // A control that says "Create your workspace" and delivers a password
      // prompt is a false promise, however convenient.
      expect(cta).toHaveAttribute("href", "/create-workspace");
    }
  });

  it("gives the landing page two visible create-workspace calls", () => {
    pathname.mockReturnValue("/");
    render(<HomePage />);

    // The hero and the closing section, both painted at every width.
    const visible = screen.getAllByRole("link", { name: /create (your )?workspace/i });
    expect(visible.length).toBeGreaterThanOrEqual(2);
  });

  it.each(PAGES)("$at sends Sign in to the real login route", ({ at, render: r }) => {
    pathname.mockReturnValue(at);
    render(r());

    for (const link of screen.getAllByRole("link", { name: /^sign in$/i })) {
      expect(link).toHaveAttribute("href", "/login");
    }
  });
});

describe("what the marketing pages claim", () => {
  it("claims no certification it does not hold", () => {
    pathname.mockReturnValue("/security");
    render(<SecurityPage />);

    const page = screen.getByRole("main").textContent ?? "";
    for (const forbidden of ["SOC 2", "SOC2", "ISO 27001", "HIPAA", "PCI", "GDPR-certified"]) {
      expect(page).not.toContain(forbidden);
    }
    expect(page).toMatch(/no certifications are claimed/i);
  });

  it("says nothing on Security that is not in the SECURITY constants", () => {
    pathname.mockReturnValue("/security");
    render(<SecurityPage />);

    const allowed = [
      SECURITY.eyebrow,
      SECURITY.title,
      SECURITY.intro,
      ...SECURITY.facts.flatMap((fact) => [fact.title, fact.body]),
      // Shared marketing copy, not a security claim: every page closes on it.
      FINAL_CTA.title,
      // The onward link to the next page.
      MARKETING_ROUTES[0].label,
    ];
    /*
      Scoped to `main`: the claim surface is the page's own content. The site
      header and footer are chrome — "Pages" and "Account" are column labels, not
      assertions about how the system is built.
    */
    const headings = within(screen.getByRole("main"))
      .getAllByRole("heading")
      .map((heading) => heading.textContent?.trim() ?? "")
      .filter(Boolean);
    for (const heading of headings) {
      expect(allowed, `"${heading}" is not a SECURITY constant`).toContain(heading);
    }
  });

  it("states the solid-versus-dashed rule in words, not only as a line style", () => {
    pathname.mockReturnValue("/how-it-works");
    render(<HowItWorksPage />);

    expect(
      screen.getByText(/accepted allocation is the only thing drawn as a solid line/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/proposal stays dashed until the owning department accepts it/i),
    ).toBeInTheDocument();
  });
});

describe("the mobile menu", () => {
  it("opens and closes, and reports which it is", async () => {
    const user = userEvent.setup();
    render(<HomePage />);

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
    const { container } = render(<HomePage />);

    // Closed means unmounted, not merely invisible — otherwise Tab would walk
    // into links nobody can see.
    expect(container.querySelector("#marketing-menu")).toBeNull();
  });

  it("offers the four routes and the create-workspace action when open", async () => {
    const user = userEvent.setup();
    const { container } = render(<HomePage />);

    await user.click(screen.getByRole("button", { name: /open menu/i }));
    const panel = container.querySelector("#marketing-menu") as HTMLElement;
    expect(panel).not.toBeNull();

    const hrefs = [...panel.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    for (const route of MARKETING_ROUTES) {
      expect(hrefs).toContain(route.href);
    }
    expect(
      within(panel).getByRole("link", { name: /create workspace/i }),
    ).toHaveAttribute("href", "/create-workspace");
  });

  it("closes once a destination is chosen", async () => {
    const user = userEvent.setup();
    const { container } = render(<HomePage />);

    await user.click(screen.getByRole("button", { name: /open menu/i }));
    const panel = container.querySelector("#marketing-menu") as HTMLElement;
    await user.click(within(panel).getByRole("link", { name: "Product" }));

    expect(container.querySelector("#marketing-menu")).toBeNull();
  });
});

/**
 * The footer is not the header again.
 *
 * For a while it was: a wordmark on the left and the same four links on the
 * right, so the bottom of every page repeated the top and a reader who had
 * scrolled the whole way down arrived at nothing new. The header is a one-line
 * control strip; the footer is the site laid out in columns.
 */
describe("the header and the footer are different objects", () => {
  it("groups the footer into labelled columns", () => {
    render(<HomePage />);
    const footer = screen.getByRole("contentinfo");

    for (const column of ["Pages", "Account"]) {
      expect(within(footer).getByRole("heading", { name: column })).toBeInTheDocument();
    }
  });

  it("keeps those groupings out of the header", () => {
    render(<HomePage />);
    const banner = screen.getByRole("banner");

    // A column heading in the bar would mean the two had converged again.
    expect(within(banner).queryByRole("heading")).toBeNull();
  });

  it("gives the footer the account actions the header has, as its own group", () => {
    render(<HomePage />);
    const footer = screen.getByRole("contentinfo");

    const account = within(footer).getByRole("navigation", { name: "Account" });
    const hrefs = [...account.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/login", "/create-workspace"]);
  });

  it("still says in the footer that no certification is claimed", () => {
    render(<HomePage />);

    // A security page that claims none should not sit above a footer that
    // implies otherwise by saying nothing.
    expect(screen.getByRole("contentinfo")).toHaveTextContent(/no certifications are claimed/i);
  });

  it("exposes exactly one banner landmark per page", () => {
    for (const page of PAGES) {
      pathname.mockReturnValue(page.at);
      const { unmount } = render(page.render());
      // The subpage header band is a section, not a second `<header>`.
      expect(screen.getAllByRole("banner")).toHaveLength(1);
      unmount();
    }
  });
});

/**
 * Every subpage is a page, not a fragment.
 *
 * They were a heading and one row of content each, ending straight into the
 * footer. A product page is expected to say what it is, show the content, and
 * offer somewhere to go.
 */
describe("each subpage carries a header band, a way onward and a closing action", () => {
  const SUBPAGES = PAGES.filter((page) => page.at !== "/");

  it.each(SUBPAGES)("$at leads with the label and title of its own route", ({ at, render: r }) => {
    pathname.mockReturnValue(at);
    render(r());

    const route = MARKETING_ROUTES.find((candidate) => candidate.href === at);
    const main = screen.getByRole("main");
    expect(main).toHaveTextContent(route?.label ?? "");
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it.each(SUBPAGES)("$at offers the next page in the sequence", ({ at, render: r }) => {
    pathname.mockReturnValue(at);
    render(r());

    const index = MARKETING_ROUTES.findIndex((candidate) => candidate.href === at);
    // Wraps, so the last page leads back to the first rather than nowhere.
    const next = MARKETING_ROUTES[(index + 1) % MARKETING_ROUTES.length];

    const onward = screen.getByRole("navigation", { name: "Next page" });
    const link = within(onward).getByRole("link");
    expect(link).toHaveAttribute("href", next.href);
    expect(link).toHaveTextContent(next.label);
    expect(link).not.toHaveAttribute("href", at);
  });

  it.each(SUBPAGES)("$at closes on the create-workspace action", ({ at, render: r }) => {
    pathname.mockReturnValue(at);
    render(r());

    const main = screen.getByRole("main");
    expect(
      within(main).getByRole("link", { name: /create your workspace/i }),
    ).toHaveAttribute("href", "/create-workspace");
    expect(within(main).getByRole("link", { name: /^sign in$/i })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("leads Product, For teams and Security with copy that already existed", () => {
    for (const [at, renderPage, lead] of [
      ["/product", () => <ProductPage />, /potriv connects project requirements/i],
      ["/for-teams", () => <ForTeamsPage />, /a person holds the roles they have been granted/i],
      ["/security", () => <SecurityPage />, /no certifications are claimed/i],
    ] as const) {
      pathname.mockReturnValue(at);
      const { unmount } = render(renderPage());
      expect(screen.getByRole("main")).toHaveTextContent(lead);
      unmount();
    }
  });
});
