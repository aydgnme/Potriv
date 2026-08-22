/**
 * The public site as a five-chapter business case.
 *
 * Every sentence in this file is either existing verified marketing copy or new
 * explanatory writing traceable to something in this repository. Where a line
 * states a fact about how Potriv behaves, the comment above it names what proves
 * it, so "is this still true?" stays an answerable question.
 *
 * What is deliberately absent: customer counts, adoption, time saved, ROI,
 * productivity percentages, AI or ML, certifications, compliance regimes,
 * encryption claims, SSO, SCIM, retention, SLAs, audits, and the words
 * "enterprise-grade", "guaranteed" and "real-time". None of those is proven
 * here, so none of them appears.
 */

export type Chapter = {
  /** Two-digit chapter number, used as the visible marker. */
  readonly number: string;
  readonly label: string;
  readonly href: string;
  /** The question a reader arrives with. */
  readonly question: string;
  /** One sentence of what the chapter answers. Not the page's own body. */
  readonly summary: string;
};

/**
 * The narrative order. Linear, not cyclic: Security is the last chapter and
 * leads to a decision, not back to Product.
 */
export const CHAPTERS = [
  {
    number: "00",
    label: "Overview",
    href: "/",
    question: "Why does this operating problem matter, and what is Potriv's model?",
    summary:
      "The coordination gap between what a project needs and who is actually " +
      "available, and the sequence Potriv puts in its place.",
  },
  {
    number: "01",
    label: "Product",
    href: "/product",
    question: "What information and decisions does the product keep straight?",
    summary:
      "The objects Potriv holds — people, skills, departments, projects, " +
      "requirements, proposals, allocations — and where one becomes the next.",
  },
  {
    number: "02",
    label: "How it works",
    href: "/how-it-works",
    question: "How does work move from a requirement to an accepted allocation?",
    summary:
      "Five stages and seven steps, with the point where a ranking stops being " +
      "information and a person has to decide.",
  },
  {
    number: "03",
    label: "For teams",
    href: "/for-teams",
    question: "Who owns each action, review, and hand-off?",
    summary:
      "Four responsibilities, what each one may do, and — as importantly — " +
      "what each one may not.",
  },
  {
    number: "04",
    label: "Security",
    href: "/security",
    question: "Which controls and boundaries can be stated truthfully today?",
    summary:
      "The controls the system enforces, the evidence behind each, and the " +
      "things that are explicitly not claimed.",
  },
] as const satisfies readonly Chapter[];

export type ChapterHref = (typeof CHAPTERS)[number]["href"];

/** The four chapters that are pages of their own, in narrative order. */
export const PLAN_CHAPTERS = CHAPTERS.filter((chapter) => chapter.href !== "/");

export function chapterFor(href: string): Chapter | undefined {
  return CHAPTERS.find((chapter) => chapter.href === href);
}

/**
 * Where each chapter leads, and why.
 *
 * Not a cycle. The old "Next" wrapped Security back to Product, which told a
 * reader who had finished the case to start it again. The last chapter ends on
 * a decision instead.
 */
export type Continuation = {
  readonly href: string;
  readonly label: string;
  /** Why the next chapter is the next question, not just what it is called. */
  readonly because: string;
};

export const CONTINUATION: Readonly<Record<string, Continuation>> = {
  "/product": {
    href: "/how-it-works",
    label: "How it works",
    because:
      "Knowing what the system holds raises the next question: how a " +
      "requirement actually becomes an accepted allocation.",
  },
  "/how-it-works": {
    href: "/for-teams",
    label: "For teams",
    because:
      "The process only means something once it is clear who owns each " +
      "decision in it.",
  },
  "/for-teams": {
    href: "/security",
    label: "Security",
    because:
      "Ownership raises the last question: which of these boundaries the " +
      "system enforces, and which it does not.",
  },
};

/* ────────────────────────────────────────────────────────────────────────────
   The operating problem — chapter 00
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Written from the shape of the product, not from research.
 *
 * Each line names something Potriv has an object for, which is what makes it a
 * description of the gap this system closes rather than a claim about how
 * common that gap is. No frequency, cost or duration is asserted anywhere.
 */
export const OPERATING_PROBLEM = {
  title: "Staffing decisions are made where the evidence is not",
  lead:
    "A project needs particular skills for a particular number of hours. The " +
    "people who could meet that need belong to departments that answer for " +
    "their capacity. Between the two sits a decision that is usually made in " +
    "conversation and recorded nowhere.",
  gaps: [
    {
      title: "Skills are described differently by everyone",
      body:
        "Without a shared catalogue, two people describing the same ability " +
        "do not match, and neither does a search for it.",
    },
    {
      title: "A requirement is not the same as a gap",
      body:
        "What a project still needs is what it asked for minus who is already " +
        "on it. Until both are written down, the gap is an opinion.",
    },
    {
      title: "Availability is held by the department, not the project",
      body:
        "The manager who knows what a person's week already contains is not " +
        "the manager asking for their hours.",
    },
    {
      title: "The decision leaves no record",
      body:
        "If nobody owns the approval, there is nothing to look back at when " +
        "the question is why somebody joined a team.",
    },
  ],
} as const;

/**
 * The model, in the product's own sequence.
 *
 * Proven by the staffing flow the application implements end to end: Team
 * Finder produces candidates, a project manager proposes, the owning department
 * accepts or rejects, and only an accepted proposal becomes an allocation.
 */
export const OPERATING_MODEL = {
  title: "What Potriv puts in its place",
  lead:
    "One sequence, with the same five stages every time, and a named owner at " +
    "the point where a decision is actually made.",
  stages: [
    { number: "01", name: "Requirement", body: "Technologies and team roles a project needs, with hours." },
    { number: "02", name: "Evidence", body: "Skills, past projects and current capacity, read from the record." },
    { number: "03", name: "Ranked candidates", body: "A score out of 100 the project manager can read line by line." },
    { number: "04", name: "Department review", body: "The department that owns the person accepts or rejects." },
    { number: "05", name: "Accepted allocation", body: "Only an accepted proposal becomes hours on a project." },
  ],
} as const;

/* ────────────────────────────────────────────────────────────────────────────
   Product — chapter 01
   ────────────────────────────────────────────────────────────────────────── */

export const PRODUCT_BRIEF = {
  summary:
    "Potriv holds the information a staffing decision needs and the record of " +
    "the decision itself. It does not make the decision.",
  boundary:
    "Everything below describes what the system keeps straight. Who is allowed " +
    "to change each of them is the subject of chapter 03.",
} as const;

/** Problems paired with the product's response. Each response is a real object. */
export const PROBLEM_RESPONSE = [
  {
    problem: "Skill descriptions do not match between people",
    response: "A curated catalogue of categories and skills, maintained centrally.",
    object: "Skill catalogue",
  },
  {
    problem: "What a project still needs is not written anywhere",
    response: "Team-role requirements and a technology stack held on the project.",
    object: "Requirement",
  },
  {
    problem: "Who could do the work is a matter of memory",
    response: "Candidates ranked from skills, past projects and capacity.",
    object: "Ranked candidates",
  },
  {
    problem: "Nobody owns the approval",
    response: "A proposal the owning department must accept before anything changes.",
    object: "Proposal",
  },
] as const;

/**
 * The objects, and what turns one into the next.
 *
 * Names taken from the API and the product's own screens, not invented for the
 * page: skill categories and skills, departments, team roles, projects with a
 * technology stack and team-role requirements, assignment proposals, and
 * allocations.
 */
export const OPERATING_OBJECTS = [
  {
    name: "People and skills",
    body:
      "An employee declares skills from the catalogue, each with a level and " +
      "a length of experience. The record is theirs to maintain.",
  },
  {
    name: "Departments",
    body:
      "People belong to a department, and that department answers for their " +
      "capacity when a project asks for their hours.",
  },
  {
    name: "Projects and requirements",
    body:
      "A project carries a technology stack and the team roles it needs, with " +
      "how many people each role still requires.",
  },
  {
    name: "Proposals",
    body:
      "A request for specific hours from a specific person, made by the " +
      "project manager and waiting on the department.",
  },
  {
    name: "Allocations",
    body:
      "An accepted proposal, and the only thing that puts a person on a " +
      "project team.",
  },
] as const;

/**
 * The decision boundary — the single most load-bearing claim on the site.
 *
 * Proven directly by `TeamFinderController`, whose contract states that the
 * score is deterministic, that no AI is involved, and that the endpoint
 * "persists nothing and creates no assignment proposal". The score composition
 * is `TeamFinderScore`: skill 60, past project 20, availability 20, total 100.
 */
export const DECISION_BOUNDARY = {
  title: "A ranking is evidence. It is not an assignment.",
  body:
    "Team Finder reads the record and returns candidates in a fixed order. It " +
    "writes nothing, and it creates no proposal. A project manager decides what " +
    "to ask for; the owning department decides whether it happens.",
  score: {
    title: "What the score is made of",
    body:
      "A total out of 100, composed the same way every time: matched skills " +
      "up to 60, past projects up to 20, and current availability up to 20. " +
      "The same inputs produce the same order, and nothing is inferred.",
  },
  notClaimed: [
    "The ranking does not choose anyone.",
    "Running Team Finder changes no record.",
    "No model or prediction is involved in the score.",
  ],
} as const;

/**
 * Deepened pillar context.
 *
 * Keyed by the existing `PILLARS` titles so the four survive verbatim; this adds
 * the input, the decision and the record each one produces, all of which are
 * objects the product already has.
 */
export const PILLAR_CONTEXT: Readonly<
  Record<string, { readonly input: string; readonly decision: string; readonly record: string }>
> = {
  "Know your people": {
    input: "Declared skills, levels, experience, department membership.",
    decision: "Which people could meet a requirement at all.",
    record: "An employee skill profile the person maintains themselves.",
  },
  "Define project needs": {
    input: "Technologies and team roles, with the number of people each needs.",
    decision: "What the project is still short of, after who is already on it.",
    record: "Team-role requirements held on the project.",
  },
  "Find candidates with evidence": {
    input: "Matched skills, past projects, current availability.",
    decision: "Which candidates a project manager wants to ask for.",
    record: "A score out of 100 that can be read component by component.",
  },
  "Keep staffing accountable": {
    input: "A proposal naming a person, a role and the hours requested.",
    decision: "Whether the owning department accepts, against real capacity.",
    record: "An accepted allocation, or a rejection with the reason given.",
  },
};

/* ────────────────────────────────────────────────────────────────────────────
   How it works — chapter 02
   ────────────────────────────────────────────────────────────────────────── */

export const PROCESS_BRIEF = {
  inputs: "A project's technologies and team roles, and the organization's people, skills and capacity.",
  decision: "A department manager accepting or rejecting a specific request for specific hours.",
  output: "An allocation on the project team, or a rejection with a reason recorded against it.",
} as const;

/**
 * Which role is accountable for each of the seven `WORKFLOW_STEPS`, and what
 * the step leaves behind.
 *
 * Every owner here is read from the authority the endpoint actually requires —
 * departments and team roles are `@OrganizationAdminOnly`, the skill catalogue
 * is `@DepartmentManagerOnly`, projects, Team Finder and proposals are
 * `@ProjectManagerOnly`, and review is `@DepartmentManagerOnly`. Keyed by step
 * title so the seven survive verbatim.
 */
export const STEP_CONTEXT: Readonly<
  Record<string, { readonly owner: string; readonly produces: string }>
> = {
  "Create workspace": { owner: "Organization admin", produces: "An organization, and its first administrator." },
  "Organize departments": { owner: "Organization admin", produces: "Departments, each with a manager to appoint." },
  "Build skills": { owner: "Department manager", produces: "A shared catalogue of categories and skills." },
  "Define requirements": { owner: "Project manager", produces: "Technologies and team-role requirements on a project." },
  "Run Team Finder": { owner: "Project manager", produces: "Ranked candidates. Nothing is written." },
  "Review staffing": { owner: "Department manager", produces: "An acceptance, or a rejection with a reason." },
  "Team updated": { owner: "Department manager", produces: "An allocation — the only way onto a team." },
};

/** The illustrative data the diagram draws. Labelled as an example on the page. */
export const WORKED_EXAMPLE = {
  title: "A worked example",
  disclaimer:
    "Illustrative data, not a customer or a production result. It is the same " +
    "example the diagram above draws.",
  rows: [
    { stage: "Requirement", detail: "Project Orion needs Java, PostgreSQL and React, and is short two Backend Engineers." },
    { stage: "Evidence", detail: "Skills matched, past projects checked, current capacity read." },
    { stage: "Ranked candidates", detail: "Three candidates scored; the highest scores 80 out of 100." },
    { stage: "Department review", detail: "Platform Engineering weighs the request against that person's real week." },
    { stage: "Accepted allocation", detail: "Six of eight hours a day, recorded against Project Orion." },
  ],
} as const;

export const DECISION_RULES = [
  {
    rule: "An accepted allocation is drawn solid.",
    body: "It is the only line that means somebody is on a project.",
  },
  {
    rule: "A proposal stays dashed until the owning department accepts it.",
    body: "Dashed means asked for, not agreed.",
  },
  {
    rule: "Nobody joins a team silently.",
    body: "There is no path from a ranking to an allocation that skips the review.",
  },
] as const;

/* ────────────────────────────────────────────────────────────────────────────
   For teams — chapter 03
   ────────────────────────────────────────────────────────────────────────── */

export const GOVERNANCE_SUMMARY = {
  title: "Roles are responsibilities, not a mode you switch into",
  body:
    "A person holds the roles they have been granted, all at once. There is no " +
    "role switcher, and holding a role is not the same as being appointed to a " +
    "particular department — a department manager without an appointment " +
    "manages no department.",
} as const;

/**
 * The decision-and-handoff matrix.
 *
 * Every cell is the authority the endpoint actually enforces, not what the role
 * name suggests:
 *
 *   departments, team roles, invites  → `@OrganizationAdminOnly`
 *   skill categories, skills          → `@DepartmentManagerOnly`
 *   skill-to-department link          → `@DepartmentManagerOnly` **and** an
 *                                       appointment; without one the backend
 *                                       answers "You are not assigned as a
 *                                       department manager"
 *   own skill profile (`/me/skills`)  → any authenticated employee
 *   projects, Team Finder, proposals  → `@ProjectManagerOnly`, and only for a
 *                                       project that manager owns
 *   accept / reject a proposal        → `@DepartmentManagerOnly`
 *
 * An organization admin is not a superuser: the same checks refuse them project
 * creation, skill administration and staffing review.
 */
export const RESPONSIBILITY_MATRIX = {
  actions: [
    "Create departments and team roles",
    "Maintain the skill catalogue",
    "Declare their own skills",
    "Define project requirements",
    "Run Team Finder and propose",
    "Accept or reject a proposal",
  ],
  roles: [
    {
      title: "Organization admin",
      owns: [true, false, true, false, false, false],
    },
    {
      title: "Department manager",
      owns: [false, true, true, false, false, true],
    },
    {
      title: "Project manager",
      owns: [false, false, true, true, true, false],
    },
    {
      title: "Employee",
      owns: [false, false, true, false, false, false],
    },
  ],
} as const;

/** What each role does *not* own. Each line is a refusal the backend enforces. */
export const GOVERNANCE_BOUNDARIES = [
  {
    role: "Organization admin",
    limit:
      "Cannot create a project, run Team Finder, administer the skill " +
      "catalogue, or review staffing. Structure is not the same authority as " +
      "the work done inside it.",
  },
  {
    role: "Department manager",
    limit:
      "Without an appointment to a department, holds the role but manages no " +
      "department — the catalogue is open to them, the department link is not.",
  },
  {
    role: "Project manager",
    limit:
      "Manages the projects they own, not every project. A project belonging " +
      "to someone else is not visible to them at all.",
  },
  {
    role: "Employee",
    limit:
      "Owns their own record. Nobody else edits their skills, and they place " +
      "nobody on a project.",
  },
] as const;

export const HANDOFF = {
  title: "One request, three desks",
  steps: [
    {
      actor: "Organization admin",
      body: "Creates the departments and team roles the rest of the model refers to.",
    },
    {
      actor: "Employee",
      body: "Declares the skills that make them findable, at a level and an experience.",
    },
    {
      actor: "Project manager",
      body: "Writes the requirement, runs Team Finder, and proposes a person for specific hours.",
    },
    {
      actor: "Department manager",
      body: "Weighs the request against that person's real capacity and accepts or rejects it.",
    },
  ],
  close:
    "Only the last of those four changes who is on a team, and it is recorded " +
    "either way.",
} as const;

/* ────────────────────────────────────────────────────────────────────────────
   Security — chapter 04
   ────────────────────────────────────────────────────────────────────────── */

export const TRUST_STATEMENT = {
  title: "What can be stated, and what cannot",
  body:
    "No certifications are claimed. What follows is a description of controls " +
    "the system enforces today, each with the observable behaviour behind it, " +
    "and each with what it does not extend to.",
} as const;

/**
 * Control areas, grouping the existing `SECURITY.facts` without restating them.
 * The facts themselves remain the source of the claims; this only says which
 * area each belongs to and where its limit is.
 */
export const CONTROL_AREAS = [
  {
    area: "Session handling",
    facts: ["Server-managed sessions"],
    evidence: "Tokens are set by the server as HttpOnly cookies; page scripts cannot read them.",
    limit: "This describes how a session is held in the browser. It is not a statement about transport or storage encryption.",
  },
  {
    area: "Authorization and isolation",
    facts: ["Backend authorization", "Organization isolation"],
    evidence: "Every request re-derives the decision from the backend, and a record outside your organization answers exactly as one that does not exist.",
    limit: "The interface never grants what the API refuses. It does not audit what an authorised person then chooses to do.",
  },
  {
    area: "Delivery gates",
    facts: ["Dependency audit gate", "CI quality gates"],
    evidence: "A high-severity advisory fails the build, and typecheck, lint, the full suite and a production build run on every change from a clean runner.",
    limit: "These are gates on what ships. They are not a penetration test or a third-party review, and neither has taken place.",
  },
  {
    area: "Allocation governance",
    facts: ["Reviewed allocations"],
    evidence: "A proposal is not an assignment; the owning department decides and the decision is recorded.",
    limit: "The system records who decided. It does not judge whether the decision was the right one.",
  },
] as const;

export const RESPONSIBILITY_BOUNDARY = {
  title: "Where the product stops and the organization starts",
  enforced: [
    "Who may call which endpoint, re-checked on every request.",
    "That a record outside your organization is indistinguishable from one that does not exist.",
    "That an allocation exists only after a named department manager accepted it.",
  ],
  organizational: [
    "Who is granted which role, and who is appointed to a department.",
    "Whether a rejection is revisited, and on what grounds.",
    "How the organization runs everything Potriv holds no record of.",
  ],
} as const;

/** Stated as an absence, deliberately, so it cannot be read as an omission. */
export const NOT_CLAIMED = [
  "No certification of any kind — SOC 2, ISO 27001 and the rest are neither held nor claimed.",
  "No third-party audit or penetration test has been performed.",
  "No uptime, availability or service-level guarantee is offered.",
  "No claim is made about encryption at rest, backups, retention or disaster recovery.",
  "No single sign-on, directory sync or exported audit trail exists today.",
] as const;
