/**
 * The worked example the homepage is built around.
 *
 * One staffing decision, carried the whole way down the page: a requirement,
 * the evidence behind it, three ranked candidates, the department that owns the
 * answer, and the allocation that results. The hero draws it in full, the dark
 * section isolates the one distinction it turns on, and the closing scene draws
 * the same shape reduced to three nodes.
 *
 * Every field here corresponds to an object the product actually has. The
 * numbers are an illustration rather than a measurement — the scores follow the
 * documented Team Finder scale (skills 60 + past projects 20 + availability 20)
 * so the example cannot imply a scoring model the product does not use, and the
 * example is labelled as one wherever it appears.
 */

/** A candidate row, as Team Finder would rank it. */
export type Candidate = {
  readonly rank: string;
  readonly name: string;
  readonly score: number;
  readonly evidence: string;
  /** The one Potriv would put forward. Exactly one row carries this. */
  readonly selected?: boolean;
};

/*
  Typed as a fixed three, not inferred. `as const` would keep each row's literal
  shape, so the two that carry no `selected` would not have the field at all and
  every reader would have to narrow before asking. The ranking is three rows by
  design — Team Finder's shortlist, not an open list — so the tuple states that.
*/
const CANDIDATES: readonly [Candidate, Candidate, Candidate] = [
  {
    rank: "01",
    name: "Mert Aydoğan",
    score: 80,
    evidence: "Java · PostgreSQL · 24 h free",
    selected: true,
  },
  { rank: "02", name: "Ana Popescu", score: 72, evidence: "Java · 16 h free" },
  { rank: "03", name: "Ioana Marin", score: 68, evidence: "PostgreSQL · 20 h free" },
];

export const DECISION = {
  project: "Project Orion",
  requirement: "Backend Engineer",
  skills: ["Java", "PostgreSQL"],
  capacity: "20 h / week",
  department: "Platform Engineering",
  candidates: CANDIDATES,
} as const;

/**
 * The five stages, as the hero graph labels them.
 *
 * The same sequence the rest of the site uses. Kept here as labels rather than
 * imported from the operating model, because these are the graph's captions and
 * have to stay short enough to sit inside it.
 */
export const GRAPH_STAGES = [
  { number: "01", label: "Requirement" },
  { number: "02", label: "Evidence" },
  { number: "03", label: "Ranked candidates" },
  { number: "04", label: "Department review" },
  { number: "05", label: "Accepted allocation" },
] as const;

/**
 * The ledger's state tags, and nothing else.
 *
 * The four conditions themselves are `OPERATING_PROBLEM.gaps`, which already
 * pairs each one: the `body` states what a decision is missing without it, and
 * the `title` names the object Potriv answers it with. Restating them here
 * would put a second canonical copy of the same four claims in the repository,
 * which is the thing splitting the pages was meant to prevent.
 *
 * These are the short words at the end of each row — what the row leaves you
 * holding once the object exists.
 */
export const LEDGER_STATES = [
  "Vocabulary",
  "Written down",
  "Owned",
  "On record",
] as const;

/**
 * The two states the dark section teaches, said in words as well as in line
 * style — the distinction is never carried by colour or dash pattern alone.
 */
export const STATES = {
  proposed: {
    label: "Proposal",
    status: "Pending department review",
    detail: "Requested 20 h / week",
    note: "Nobody is on a team yet.",
  },
  accepted: {
    label: "Accepted allocation",
    status: `Accepted by ${DECISION.department}`,
    detail: `20 h / week on ${DECISION.project}`,
    note: "This is the only state that puts somebody on a team.",
  },
} as const;

/**
 * What each chapter's preview draws.
 *
 * The kind picks the micro-diagram; the lines are its labels. Keeping them here
 * means a chapter's preview and its entry cannot drift apart.
 */
export type PreviewKind = "objects" | "flow" | "lanes" | "controls";

export const CHAPTER_PREVIEWS: Record<string, {
  readonly kind: PreviewKind;
  readonly caption: string;
  readonly lines: readonly string[];
}> = {
  "/product": {
    kind: "objects",
    caption: "What the product keeps straight",
    lines: ["Project", "Requirement", "Skill", "Person", "Department"],
  },
  "/how-it-works": {
    kind: "flow",
    caption: "Requirement to accepted allocation",
    lines: GRAPH_STAGES.map((stage) => stage.label),
  },
  "/for-teams": {
    kind: "lanes",
    caption: "Who owns each action",
    lines: ["Organization admin", "Department manager", "Project manager", "Team member"],
  },
  "/security": {
    kind: "controls",
    caption: "What can be stated truthfully today",
    lines: ["Controls in place", "Boundaries", "Not claimed"],
  },
};

/**
 * The line under the hero's calls to action.
 *
 * Both halves restate what `FINAL_CTA.body` already says — a workspace can be
 * created, a team invited afterwards. A third clause about payment was dropped:
 * the repository has no billing, pricing or subscription of any kind, so
 * "no credit card" would be a claim about commercial policy that nothing here
 * can support.
 */
export const HERO_ASSURANCE = "Start with one department · Invite your team later";
