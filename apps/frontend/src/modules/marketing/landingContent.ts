/**
 * Every word the public landing says, in one file.
 *
 * Copy lives here rather than inside each component so the claims can be read
 * as a set and checked against what the product actually does. The security
 * section in particular is a list of assertions about this repository; keeping
 * them together is what makes "is this still true?" an answerable question.
 *
 * Nothing here is fetched, and nothing here is user data. This module is pure
 * constants so the landing can render without touching a session or a backend.
 */

/** Where the two public actions go. Defined once; the header, hero and final
 *  CTA all read from here so they cannot drift apart. */
export const SIGN_IN_HREF = "/login";
export const CREATE_WORKSPACE_HREF = "/create-workspace";

export const LANDING_SECTIONS = [
  { id: "product", label: "Product" },
  { id: "how-it-works", label: "How it works" },
  { id: "for-teams", label: "For teams" },
  { id: "security", label: "Security" },
] as const;

export const HERO = {
  eyebrow: "Workforce staffing for multi-team organizations",
  title: "Build the right project team with the people you already have.",
  lead:
    "Potriv connects project requirements with your organization's people, " +
    "skills, roles and real availability — then keeps staffing decisions " +
    "explicit and reviewable.",
  primaryCta: "Create your workspace",
  secondaryCta: "See how it works",
  /**
   * The product-truth notes. These describe the relationship grammar used by
   * the hero diagram, which is why they sit directly beneath it: they turn a
   * line style into a stated rule.
   */
  truths: [
    "An accepted allocation is the only thing drawn as a solid line.",
    "A proposal stays dashed until the owning department accepts it.",
  ],
} as const;

export const PILLARS = [
  {
    number: "01",
    title: "Know your people",
    body: "Skills, departments, roles and project history.",
  },
  {
    number: "02",
    title: "Define project needs",
    body:
      "Technologies, team-role requirements and the staffing gap that is " +
      "still open.",
  },
  {
    number: "03",
    title: "Find candidates with evidence",
    body:
      "A fixed score you can read line by line: matched skills, past " +
      "projects, availability.",
  },
  {
    number: "04",
    title: "Keep staffing accountable",
    body:
      "Project managers propose. Department managers review. Nobody silently " +
      "joins a team.",
  },
] as const;

export const WORKFLOW_STEPS = [
  {
    number: "01",
    title: "Create workspace",
    body: "One organization, with the first administrator who owns its structure.",
  },
  {
    number: "02",
    title: "Organize departments",
    body: "Departments hold people and review the staffing requests made against them.",
  },
  {
    number: "03",
    title: "Build skills",
    body: "A curated catalogue, so two people describing the same ability agree.",
  },
  {
    number: "04",
    title: "Define requirements",
    body: "Technologies and team roles a project needs, and how many hours.",
  },
  {
    number: "05",
    title: "Run Team Finder",
    body: "Candidates ranked by the backend against those requirements.",
  },
  {
    number: "06",
    title: "Review staffing",
    body: "The owning department accepts or rejects, against real capacity.",
  },
  {
    number: "07",
    title: "Team updated",
    body: "Only an accepted proposal becomes an allocation on the project.",
  },
] as const;

/**
 * `glyph` names what the role is responsible for, which is how the four are
 * actually distinguished — not by who they are.
 */
export const ROLES = [
  {
    title: "Project manager",
    glyph: "project",
    owns: "Owns the requirement, not the people.",
    body:
      "Defines technologies and team roles, runs Team Finder and asks for the " +
      "hours a project needs.",
  },
  {
    title: "Department manager",
    glyph: "department",
    owns: "Owns the people.",
    body:
      "Reviews every request against real capacity — allocated now, available " +
      "now, and what acceptance would make it.",
  },
  {
    title: "Organization admin",
    glyph: "organization",
    owns: "Owns the structure.",
    body:
      "Creates departments and team roles, curates the skill catalogue and " +
      "decides who is in the workspace.",
  },
  {
    title: "Employee",
    glyph: "skills",
    owns: "Owns their own record.",
    body:
      "Declares skills, levels and experience, and sees the projects they are " +
      "on and have been on.",
  },
] as const;

/**
 * Security claims.
 *
 * Each line is a property of the system as built, and each is checkable in this
 * repository. No certification, compliance regime or third-party audit is
 * claimed anywhere, because none has happened.
 */
export const SECURITY = {
  eyebrow: "Security",
  title: "What we can state plainly",
  intro:
    "No certifications are claimed. Each line below is a property of the " +
    "system as it is built today, verifiable in the code that runs it.",
  facts: [
    {
      title: "Server-managed sessions",
      body:
        "Tokens live in HttpOnly cookies set by the server. Browser JavaScript " +
        "never reads them.",
    },
    {
      title: "Backend authorization",
      body:
        "Every decision is re-derived from the backend on each request. The " +
        "interface never grants what the API would refuse.",
    },
    {
      title: "Organization isolation",
      body:
        "Records are scoped to one organization, and a record outside yours is " +
        "answered the same way as one that does not exist.",
    },
    {
      title: "Dependency audit gate",
      body:
        "A high-severity advisory in the dependency tree fails the build " +
        "before anything ships.",
    },
    {
      title: "CI quality gates",
      body:
        "Typecheck, lint, the full test suite and a production build run on " +
        "every change from a clean runner.",
    },
    {
      title: "Reviewed allocations",
      body:
        "A proposal is not an assignment. The owning department decides, and " +
        "the decision is recorded.",
    },
  ],
} as const;

export const FINAL_CTA = {
  title: "Start with one department and one project.",
  body:
    "Create a workspace, invite your team, and staff the work you already " +
    "have. Nothing else has to be in place first.",
} as const;
