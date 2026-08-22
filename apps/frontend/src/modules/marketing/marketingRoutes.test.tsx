import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CHAPTERS, CONTINUATION, PLAN_CHAPTERS, RESPONSIBILITY_MATRIX } from "./businessPlan";
import { MARKETING_ROUTES, ROLES, SECURITY, WORKFLOW_STEPS } from "./landingContent";
import { ForTeamsPage } from "./components/pages/ForTeamsPage";
import { HomePage } from "./components/pages/HomePage";
import { HowItWorksPage } from "./components/pages/HowItWorksPage";
import { ProductPage } from "./components/pages/ProductPage";
import { SecurityPage } from "./components/pages/SecurityPage";

/**
 * The public site as a five-chapter business case.
 *
 * The first version of these pages was four routes each holding one heading and
 * one list, wrapped in a template that gave every route the same band, the same
 * "Next", and the same closing CTA. That is a URL split, not an information
 * architecture: a reader could not use it to answer what the problem is, who
 * decides, or what is not being claimed.
 *
 * These lock the replacement — route-specific narrative, a linear chapter
 * progression that ends rather than loops, and a claim surface that stays inside
 * what the repository can prove.
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

const SUBPAGES = PAGES.filter((page) => page.at !== "/");

/** The `h2` sequence a page renders, which is its narrative skeleton. */
function sectionTitles() {
  return within(screen.getByRole("main"))
    .getAllByRole("heading", { level: 2 })
    .map((heading) => heading.textContent?.trim() ?? "");
}

describe("every route is a page with its own subject", () => {
  it.each(PAGES)("$at has one h1 naming its subject", ({ at, render: r, h1 }) => {
    pathname.mockReturnValue(at);
    render(r());

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: h1 })).toBeInTheDocument();
  });

  it.each(PAGES)("$at exposes exactly one of each landmark", ({ at, render: r }) => {
    pathname.mockReturnValue(at);
    render(r());

    expect(screen.getAllByRole("banner")).toHaveLength(1);
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getAllByRole("contentinfo")).toHaveLength(1);
  });

  it.each(PAGES)("$at is public — no password field", ({ at, render: r }) => {
    pathname.mockReturnValue(at);
    render(r());

    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });

  it.each(PAGES)("$at states its chapter number and decision question", ({ at, render: r }) => {
    pathname.mockReturnValue(at);
    render(r());

    const chapter = CHAPTERS.find((candidate) => candidate.href === at);
    const main = screen.getByRole("main");
    if (at === "/") {
      /*
        The overview does not label itself as a chapter — it is the document, not
        a part of it. What it must carry is the index, and that is asserted in
        full by "indexes the four chapters by their decision question".
      */
      for (const other of PLAN_CHAPTERS) {
        expect(main).toHaveTextContent(other.number);
      }
      return;
    }
    expect(main).toHaveTextContent(chapter?.number ?? "");
    expect(main).toHaveTextContent(chapter?.question ?? "");
  });
});

describe("the four chapters are not one template rendered four times", () => {
  it("gives each subpage a different section sequence", () => {
    const sequences = new Map<string, readonly string[]>();
    for (const page of SUBPAGES) {
      pathname.mockReturnValue(page.at);
      const { unmount } = render(page.render());
      sequences.set(page.at, sectionTitles());
      unmount();
    }

    // Four distinct skeletons. When every page shared one template these were
    // identical, and the pages were interchangeable.
    const joined = [...sequences.values()].map((titles) => titles.join(" | "));
    expect(new Set(joined).size).toBe(SUBPAGES.length);
    for (const [href, titles] of sequences) {
      expect(titles.length, `${href} has too few sections to be a chapter`).toBeGreaterThanOrEqual(3);
    }
  });

  it("does not close all four on the same block", () => {
    const closings = new Map<string, string>();
    for (const page of SUBPAGES) {
      pathname.mockReturnValue(page.at);
      const { unmount } = render(page.render());
      closings.set(page.at, sectionTitles().at(-1) ?? "");
      unmount();
    }
    // Security ends on its own conclusion; the others end on their own last part.
    expect(new Set(closings.values()).size).toBe(SUBPAGES.length);
  });
});

describe("chapter progression is linear and ends", () => {
  it.each(Object.keys(CONTINUATION))("%s explains why the next chapter follows", (from) => {
    const page = SUBPAGES.find((candidate) => candidate.at === from);
    if (!page) throw new Error(`no page for ${from}`);
    pathname.mockReturnValue(from);
    render(page.render());

    const onward = screen.getByRole("navigation", { name: "Continue the plan" });
    const link = within(onward).getByRole("link");
    expect(link).toHaveAttribute("href", CONTINUATION[from].href);
    // Not the bare word "Next": the reader is told why it is worth following.
    expect(onward).toHaveTextContent(CONTINUATION[from].because);
  });

  it("does not wrap Security back to Product", () => {
    pathname.mockReturnValue("/security");
    render(<SecurityPage />);

    expect(screen.queryByRole("navigation", { name: "Continue the plan" })).toBeNull();
    const main = screen.getByRole("main");
    // The last chapter offers a decision, not another lap.
    expect(within(main).queryByRole("link", { name: /continue to product/i })).toBeNull();
    expect(within(main).getByRole("link", { name: /create your workspace/i })).toHaveAttribute(
      "href",
      "/create-workspace",
    );
    expect(within(main).getByRole("link", { name: /back to the overview/i })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("orders the chapters 00 through 04 exactly once each", () => {
    expect(CHAPTERS.map((chapter) => chapter.number)).toEqual(["00", "01", "02", "03", "04"]);
    expect(new Set(CHAPTERS.map((chapter) => chapter.href)).size).toBe(CHAPTERS.length);
  });
});

describe("00 · the overview is an executive summary", () => {
  beforeEach(() => pathname.mockReturnValue("/"));

  it("states the operating problem, not only the proposition", () => {
    render(<HomePage />);
    const main = screen.getByRole("main");

    expect(
      within(main).getByRole("heading", { name: /staffing decisions are made where the evidence is not/i }),
    ).toBeInTheDocument();
    // Named gaps, each one something the product has an object for.
    expect(within(main).getByRole("heading", { name: /skills are described differently/i })).toBeInTheDocument();
    expect(within(main).getByRole("heading", { name: /availability is held by the department/i })).toBeInTheDocument();
  });

  it("shows the five-stage model with the relationship grammar", () => {
    render(<HomePage />);
    const main = screen.getByRole("main");

    for (const stage of ["Requirement", "Evidence", "Ranked candidates", "Department review", "Accepted allocation"]) {
      expect(within(main).getByRole("heading", { name: stage })).toBeInTheDocument();
    }
    expect(main).toHaveTextContent(/accepted allocation is the only thing drawn as a solid line/i);
    expect(main).toHaveTextContent(/proposal stays dashed until the owning department accepts it/i);
  });

  it("indexes the four chapters by their decision question", () => {
    render(<HomePage />);
    const main = screen.getByRole("main");

    for (const chapter of PLAN_CHAPTERS) {
      expect(within(main).getByRole("heading", { name: chapter.question })).toBeInTheDocument();
      expect(main).toHaveTextContent(chapter.summary);
      expect(
        within(main).getByRole("link", { name: `Read chapter ${chapter.number}` }),
      ).toHaveAttribute("href", chapter.href);
    }
  });

  it("still does not hold the four canonical bodies", () => {
    render(<HomePage />);
    const main = screen.getByRole("main").textContent ?? "";

    // Chapter summaries, not the chapters.
    expect(main).not.toContain(WORKFLOW_STEPS[0].body);
    expect(main).not.toContain(ROLES[0].body);
    expect(main).not.toContain(SECURITY.facts[0].body);
    expect(screen.queryByRole("heading", { name: ROLES[0].title })).toBeNull();
  });

  it("offers the bounded starting point", () => {
    render(<HomePage />);
    const main = screen.getByRole("main");

    expect(within(main).getByRole("heading", { name: /start with one department and one project/i }))
      .toBeInTheDocument();
    expect(within(main).getAllByRole("link", { name: /create your workspace/i })[0]).toHaveAttribute(
      "href",
      "/create-workspace",
    );
  });
});

describe("01 · product explains the model, not just the pillars", () => {
  beforeEach(() => pathname.mockReturnValue("/product"));

  it("pairs each operating problem with the object that answers it", () => {
    render(<ProductPage />);
    const main = screen.getByRole("main");

    expect(main).toHaveTextContent(/skill descriptions do not match between people/i);
    expect(main).toHaveTextContent(/a curated catalogue of categories and skills/i);
    expect(main).toHaveTextContent(/nobody owns the approval/i);
  });

  it("names the operating objects in the product's own terms", () => {
    render(<ProductPage />);
    const main = screen.getByRole("main");

    for (const object of ["People and skills", "Departments", "Projects and requirements", "Proposals", "Allocations"]) {
      expect(within(main).getByRole("heading", { name: object })).toBeInTheDocument();
    }
  });

  it("keeps all four pillars and gives each an input, a decision and a record", () => {
    render(<ProductPage />);
    const main = screen.getByRole("main");

    expect(within(main).getByRole("heading", { name: "Know your people" })).toBeInTheDocument();
    expect(within(main).getByRole("heading", { name: "Keep staffing accountable" })).toBeInTheDocument();
    expect(within(main).getAllByText("Input")).toHaveLength(4);
    expect(within(main).getAllByText("Decision")).toHaveLength(4);
    expect(within(main).getAllByText("Recorded")).toHaveLength(4);
  });

  /**
   * The single most load-bearing claim on the site, and the one a redesign is
   * most likely to trim: Team Finder writes nothing and creates no proposal.
   * Proven by `TeamFinderController`, whose contract says exactly that.
   */
  it("states that a ranking is evidence and not an assignment", () => {
    render(<ProductPage />);
    const main = screen.getByRole("main");

    expect(
      within(main).getByRole("heading", { name: /a ranking is evidence\. it is not an assignment\./i }),
    ).toBeInTheDocument();
    expect(main).toHaveTextContent(/writes nothing, and it creates no proposal/i);
    expect(main).toHaveTextContent(/the ranking does not choose anyone/i);
    expect(main).toHaveTextContent(/no model or prediction is involved/i);
    // The score composition, as the backend defines it.
    expect(main).toHaveTextContent(/matched skills up to 60/i);
  });
});

describe("02 · how it works keeps the process whole", () => {
  beforeEach(() => pathname.mockReturnValue("/how-it-works"));

  it("opens on inputs, the governed decision and the output", () => {
    render(<HowItWorksPage />);
    const main = screen.getByRole("main");

    expect(within(main).getByText("Inputs")).toBeInTheDocument();
    expect(within(main).getByText("Governed decision")).toBeInTheDocument();
    expect(within(main).getByText("Output")).toBeInTheDocument();
  });

  it("keeps all seven steps, in order, with an owner and a record", () => {
    render(<HowItWorksPage />);
    const main = screen.getByRole("main");

    const steps = main.querySelectorAll("ol > li");
    const titles = [...steps]
      .map((step) => step.querySelector("h3")?.textContent ?? "")
      .filter(Boolean);
    for (const step of WORKFLOW_STEPS) {
      expect(titles).toContain(step.title);
    }
    expect(within(main).getAllByText("Owner")).toHaveLength(WORKFLOW_STEPS.length);
    expect(within(main).getAllByText("Produces")).toHaveLength(WORKFLOW_STEPS.length);
  });

  it("tells the same five-stage story as the diagram", () => {
    render(<HowItWorksPage />);
    const main = screen.getByRole("main");

    for (const stage of ["Requirement", "Evidence", "Ranked candidates", "Department review", "Accepted allocation"]) {
      expect(within(main).getByRole("heading", { name: stage })).toBeInTheDocument();
    }
    // And the diagram itself is still here, still inline SVG.
    expect(main.querySelectorAll('svg[role="img"]').length).toBeGreaterThanOrEqual(2);
  });

  it("labels the worked example as an example", () => {
    render(<HowItWorksPage />);
    const main = screen.getByRole("main");

    expect(main).toHaveTextContent(/illustrative data, not a customer or a production result/i);
    expect(main).toHaveTextContent(/project orion/i);
  });

  it("states the three decision rules", () => {
    render(<HowItWorksPage />);
    const main = screen.getByRole("main");

    expect(main).toHaveTextContent(/an accepted allocation is drawn solid/i);
    expect(main).toHaveTextContent(/a proposal stays dashed/i);
    expect(main).toHaveTextContent(/nobody joins a team silently/i);
  });
});

describe("03 · for teams is a governance model", () => {
  beforeEach(() => pathname.mockReturnValue("/for-teams"));

  it("keeps all four roles and their verified boundaries", () => {
    render(<ForTeamsPage />);
    const main = screen.getByRole("main");

    /*
      Scoped to the profiles section: a role name appears more than once on this
      page on purpose — once as a profile, again in the hand-off narrative — and
      a document-wide query would read that as an ambiguity rather than as the
      same person being referred to twice.
    */
    const profiles = within(main).getByRole("heading", { name: /responsibility profiles/i })
      .closest("section") as HTMLElement;
    for (const role of ROLES) {
      expect(within(profiles).getByRole("heading", { name: role.title })).toBeInTheDocument();
      expect(profiles).toHaveTextContent(role.owns);
    }
  });

  /*
    Pinned against `ROLES` rather than against the matrix's own list. Iterating
    `RESPONSIBILITY_MATRIX.roles` proves only that the component renders whatever
    it was given — deleting a role from that constant left every test green,
    which a mutation caught. `ROLES` is the independent source for who the four
    are.
  */
  it("covers exactly the four roles the product defines", () => {
    render(<ForTeamsPage />);
    const table = within(screen.getByRole("main")).getByRole("table");

    const rows = within(table).getAllByRole("rowheader").map((cell) => cell.textContent?.trim());
    expect(new Set(rows)).toEqual(new Set(ROLES.map((role) => role.title)));
    expect(rows).toHaveLength(ROLES.length);
  });

  it("exposes the responsibility matrix as a real table", () => {
    render(<ForTeamsPage />);
    const table = within(screen.getByRole("main")).getByRole("table");

    // Column headers are the actions; row headers are the roles.
    const columns = within(table).getAllByRole("columnheader").map((cell) => cell.textContent);
    for (const action of RESPONSIBILITY_MATRIX.actions) {
      expect(columns).toContain(action);
    }
    const rows = within(table).getAllByRole("rowheader").map((cell) => cell.textContent);
    for (const role of RESPONSIBILITY_MATRIX.roles) {
      expect(rows).toContain(role.title);
    }
  });

  it("answers each cell in words, not by colour or a mark alone", () => {
    render(<ForTeamsPage />);
    const table = within(screen.getByRole("main")).getByRole("table");

    const cells = within(table).getAllByRole("cell").map((cell) => cell.textContent?.trim());
    expect(cells.length).toBe(
      RESPONSIBILITY_MATRIX.roles.length * RESPONSIBILITY_MATRIX.actions.length,
    );
    for (const cell of cells) {
      expect(["Yes", "No"]).toContain(cell);
    }
  });

  it("carries the column name on every cell, so a stacked row keeps its meaning", () => {
    render(<ForTeamsPage />);
    const table = within(screen.getByRole("main")).getByRole("table");

    for (const cell of within(table).getAllByRole("cell")) {
      expect(RESPONSIBILITY_MATRIX.actions).toContain(cell.getAttribute("data-label"));
    }
  });

  /** An organization admin is not a superuser; the matrix has to say so. */
  it("shows the authority boundaries the backend actually enforces", () => {
    render(<ForTeamsPage />);
    const main = screen.getByRole("main");

    expect(main).toHaveTextContent(/cannot create a project, run team finder/i);
    expect(main).toHaveTextContent(/without an appointment to a department/i);
    expect(main).toHaveTextContent(/manages the projects they own, not every project/i);
  });

  it("narrates the hand-off between the four desks", () => {
    render(<ForTeamsPage />);
    const main = screen.getByRole("main");

    expect(within(main).getByRole("heading", { name: /one request, three desks/i })).toBeInTheDocument();
    expect(main).toHaveTextContent(/only the last of those four changes who is on a team/i);
  });
});

describe("04 · security states controls and limits together", () => {
  beforeEach(() => pathname.mockReturnValue("/security"));

  it("keeps the no-certification boundary near the top", () => {
    render(<SecurityPage />);
    const main = screen.getByRole("main");

    expect(main).toHaveTextContent(/no certifications are claimed/i);
    expect(main).toHaveTextContent(/neither held nor claimed/i);
  });

  it("groups every existing security fact into a control area", () => {
    render(<SecurityPage />);
    const main = screen.getByRole("main");

    for (const fact of SECURITY.facts) {
      expect(main).toHaveTextContent(fact.title);
      expect(main).toHaveTextContent(fact.body);
    }
    for (const area of ["Session handling", "Authorization and isolation", "Delivery gates", "Allocation governance"]) {
      expect(within(main).getByRole("heading", { name: area })).toBeInTheDocument();
    }
  });

  it("pairs every area with evidence and a stated limit", () => {
    render(<SecurityPage />);
    const main = screen.getByRole("main");

    expect(within(main).getAllByText("Evidence")).toHaveLength(4);
    expect(within(main).getAllByText("Not claimed")).toHaveLength(4);
  });

  it("separates what the product enforces from what the organization decides", () => {
    render(<SecurityPage />);
    const main = screen.getByRole("main");

    expect(within(main).getByRole("heading", { name: /the product enforces/i })).toBeInTheDocument();
    expect(within(main).getByRole("heading", { name: /your organization decides/i })).toBeInTheDocument();
  });

  it("lists the absences plainly", () => {
    render(<SecurityPage />);
    const main = screen.getByRole("main");

    expect(main).toHaveTextContent(/no third-party audit or penetration test/i);
    expect(main).toHaveTextContent(/no uptime, availability or service-level guarantee/i);
    expect(main).toHaveTextContent(/no single sign-on, directory sync or exported audit trail/i);
  });
});

/**
 * The claim surface.
 *
 * Deliberately not a word ban: the Security page has to be able to say "SOC 2"
 * in order to disclaim it, and a test that forbade the string outright would
 * force the page to be vaguer than the truth. This checks the shape of a claim
 * instead — a certification named *as held*, a metric, or an empty superlative.
 */
describe("nothing is claimed that the repository cannot prove", () => {
  const CLAIMED_CERTIFICATION =
    /(soc\s*2|iso\s*27001|hipaa|pci|gdpr)[^.]{0,40}\b(certified|compliant|compliance|accredited|audited)\b/i;
  const INVENTED_METRIC = /\b\d+\s*(%|percent)\b|\b(save|saves|saving)\s+\d+/i;
  const EMPTY_SUPERLATIVE = /\b(enterprise-grade|world-class|best-in-class|cutting-edge|ai-powered|machine learning)\b/i;
  /*
    Shaped as a promise, not as the word. The Security page has to be able to say
    "no uptime, availability or service-level guarantee is offered" — a ban on
    the noun would force it to be vaguer than the truth, which is the opposite of
    what this test is for. The negation is excluded explicitly.
  */
  const OVERPROMISE = /(?<!\bno\s)(?<!\bnor\s)\b(guaranteed|100% uptime|zero downtime)\b/i;

  it.each(PAGES)("$at claims no certification it does not hold", ({ at, render: r }) => {
    pathname.mockReturnValue(at);
    render(r());
    const text = document.body.textContent ?? "";

    expect(text).not.toMatch(CLAIMED_CERTIFICATION);
  });

  it.each(PAGES)("$at invents no metric and promises no outcome", ({ at, render: r }) => {
    pathname.mockReturnValue(at);
    render(r());
    const text = document.body.textContent ?? "";

    expect(text).not.toMatch(INVENTED_METRIC);
    expect(text).not.toMatch(EMPTY_SUPERLATIVE);
    expect(text).not.toMatch(OVERPROMISE);
  });

  it("uses 'deterministic' only where the backend proves it", () => {
    pathname.mockReturnValue("/product");
    render(<ProductPage />);

    // `TeamFinderController` states the score is deterministic and that no AI is
    // involved. The page may say so; it may not say the ranking decides.
    const main = screen.getByRole("main").textContent ?? "";
    expect(main).not.toMatch(/ranking (decides|assigns|chooses)/i);
    expect(main).not.toMatch(/automatically (assigns|allocates|staffs)/i);
  });
});

describe("navigation destinations", () => {
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

  it.each(PAGES)("$at has no navigation link that is only a fragment", ({ at, render: r }) => {
    pathname.mockReturnValue(at);
    const { container } = render(r());

    for (const anchor of container.querySelectorAll("a")) {
      const href = anchor.getAttribute("href") ?? "";
      // The skip link is the one legitimate fragment, and it is not navigation.
      if (href === "#main") continue;
      expect(href.startsWith("#"), `"${href}" is a fragment`).toBe(false);
    }
  });

  it.each(PAGES)("$at sends Sign in to the real login route", ({ at, render: r }) => {
    pathname.mockReturnValue(at);
    render(r());

    for (const link of screen.getAllByRole("link", { name: /^sign in$/i })) {
      expect(link).toHaveAttribute("href", "/login");
    }
  });

  it.each(PAGES)("$at sends every create-workspace call to the real route", ({ at, render: r }) => {
    pathname.mockReturnValue(at);
    const { container } = render(r());

    // By attribute: the header's create action is display:none below 640px, so
    // at jsdom's width a role query would miss the very link being asserted.
    const ctas = [...container.querySelectorAll("a")].filter((a) =>
      /create (your )?workspace/i.test(a.textContent ?? ""),
    );
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) {
      expect(cta).toHaveAttribute("href", "/create-workspace");
    }
  });
});

describe("the header and the footer stay different objects", () => {
  it("exposes exactly the four marketing routes in the header nav", () => {
    const { container } = render(<HomePage />);

    const nav = container.querySelector('nav[aria-label="Marketing"]');
    expect(nav).not.toBeNull();
    expect([...(nav?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href"))).toEqual(
      MARKETING_ROUTES.map((route) => route.href),
    );
  });

  it("groups the footer into labelled columns the header does not have", () => {
    render(<HomePage />);

    const footer = screen.getByRole("contentinfo");
    for (const column of ["Pages", "Account"]) {
      expect(within(footer).getByRole("heading", { name: column })).toBeInTheDocument();
    }
    expect(within(screen.getByRole("banner")).queryByRole("heading")).toBeNull();
  });

  it("gives the footer the account actions as their own group", () => {
    render(<HomePage />);

    const account = within(screen.getByRole("contentinfo")).getByRole("navigation", {
      name: "Account",
    });
    expect([...account.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual([
      "/login",
      "/create-workspace",
    ]);
  });

  it("still says in the footer that no certification is claimed", () => {
    render(<HomePage />);
    expect(screen.getByRole("contentinfo")).toHaveTextContent(/no certifications are claimed/i);
  });

  it("gives the wordmark the home route and the skip link the main landmark", () => {
    render(<HomePage />);
    const banner = screen.getByRole("banner");

    expect(within(banner).getByRole("link", { name: "POTRIV" })).toHaveAttribute("href", "/");
    expect(within(banner).getByRole("link", { name: /skip to content/i })).toHaveAttribute(
      "href",
      "#main",
    );
  });
});

describe("the current chapter is announced, not merely coloured", () => {
  it.each(MARKETING_ROUTES)("marks $href current when that is the path", (route) => {
    pathname.mockReturnValue(route.href);
    const { container } = render(<ProductPage />);

    const current = [...container.querySelectorAll('a[aria-current="page"]')].map((a) =>
      a.getAttribute("href"),
    );
    expect(new Set(current)).toEqual(new Set([route.href]));
  });

  it("marks nothing current on the overview", () => {
    pathname.mockReturnValue("/");
    const { container } = render(<HomePage />);
    expect(container.querySelectorAll('a[aria-current="page"]')).toHaveLength(0);
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
    expect(container.querySelector("#marketing-menu")).toBeNull();
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
