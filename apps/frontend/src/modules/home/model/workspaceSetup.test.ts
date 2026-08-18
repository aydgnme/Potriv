import { describe, expect, it } from "vitest";

import { buildWorkspaceSetup } from "./workspaceSetup";

/**
 * Workspace setup guidance.
 *
 * Every test here defends the same rule: a step may only claim completion when
 * a real read said so. The three states are not cosmetic — `unknown` exists so
 * the page can decline to answer rather than guess.
 */

const ok = <T,>(value: readonly T[]) => ({ ok: true as const, value });
const failed = { ok: false as const, reason: "ERROR" as const };
const forbidden = { ok: false as const, reason: "FORBIDDEN" as const };

function build(overrides: Partial<Parameters<typeof buildWorkspaceSetup>[0]> = {}) {
  return buildWorkspaceSetup({
    departments: ok([]),
    teamRoles: ok([]),
    skills: ok([]),
    organizationUsers: ok([{ userId: "founder" }]),
    // The default is the founder's real starting position: an organization admin
    // holds no PROJECT_MANAGER, so this is false unless a test says otherwise.
    canCreateProject: false,
    ...overrides,
  });
}

function step(setup: ReturnType<typeof buildWorkspaceSetup>, id: string) {
  const found = setup.steps.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`no step ${id}`);
  return found;
}

describe("a brand new workspace", () => {
  it("marks nothing done when every real read came back empty", () => {
    const setup = build();

    expect(step(setup, "departments").state).toBe("todo");
    expect(step(setup, "team-roles").state).toBe("todo");
    expect(step(setup, "skills").state).toBe("todo");
    expect(step(setup, "members").state).toBe("todo");
  });

  it("gives every step somewhere real to go", () => {
    const setup = build();

    for (const s of setup.steps) {
      expect(s.actionHref.startsWith("/")).toBe(true);
      expect(s.actionLabel.length).toBeGreaterThan(0);
    }
  });

  it("is not settled", () => {
    expect(build().settled).toBe(false);
  });
});

describe("completion from real signals", () => {
  it("marks departments done once one exists", () => {
    const setup = build({ departments: ok([{ id: "d1" }]) });

    expect(step(setup, "departments").state).toBe("done");
  });

  it("marks team roles done once one exists", () => {
    const setup = build({ teamRoles: ok([{ id: "t1" }]) });

    expect(step(setup, "team-roles").state).toBe("done");
  });

  /**
   * The distinction this test exists for: the catalogue signal must come from
   * the organization's skills, never from the founder's own declared skills.
   * A founder with three personal skills has not built a catalogue.
   */
  it("marks the catalogue done from organization skills", () => {
    const setup = build({ skills: ok([{ id: "s1" }]) });

    expect(step(setup, "skills").state).toBe("done");
  });

  it("counts the team as brought in only once somebody else joined", () => {
    // One member is the founder alone.
    expect(step(build({ organizationUsers: ok([{ userId: "a" }]) }), "members").state)
      .toBe("todo");

    expect(
      step(build({ organizationUsers: ok([{ userId: "a" }, { userId: "b" }]) }), "members")
        .state,
    ).toBe("done");
  });
});

describe("what cannot be answered", () => {
  /**
   * There is no organization-wide project read. `/projects/managed` is scoped
   * to the caller's managed projects and `/me/projects` to their own — so an
   * administrator who manages nothing would be told a busy workspace is empty.
   */
  it("never claims anything about the first project", () => {
    const setup = build();

    expect(step(setup, "first-project").state).toBe("unknown");
    // It still offers an action, because creating a project is the right move.
    // Where that action *goes* depends on whether this account may create one —
    // see "the first-project step" below.
    expect(step(setup, "first-project").actionHref).not.toBe("");
  });

  it.each([
    ["departments", { departments: failed }],
    ["team-roles", { teamRoles: failed }],
    ["skills", { skills: failed }],
    ["members", { organizationUsers: failed }],
  ] as const)("marks %s unavailable when its read fails", (id, override) => {
    const setup = build(override);

    // Answerable, unanswered. Not `todo`, which would invent a task, and not
    // `unknown`, which would describe a permanent gap in the product.
    expect(step(setup, id).state).toBe("unavailable");
    expect(step(setup, id).state).not.toBe("todo");
    expect(step(setup, id).state).not.toBe("unknown");
  });

  it("marks a forbidden read unavailable too", () => {
    const setup = build({ teamRoles: forbidden });

    expect(step(setup, "team-roles").state).toBe("unavailable");
  });

  it("does not count unanswerable steps towards being settled", () => {
    const setup = build({
      departments: ok([{ id: "d" }]),
      teamRoles: ok([{ id: "t" }]),
      skills: ok([{ id: "s" }]),
      organizationUsers: ok([{ userId: "a" }, { userId: "b" }]),
    });

    // Every answerable step is done; the unanswerable one is not held against
    // it, and is not silently treated as complete either.
    expect(setup.settled).toBe(true);
    expect(step(setup, "first-project").state).toBe("unknown");
  });

  it("is not settled while an answerable signal is unavailable", () => {
    const setup = build({
      departments: ok([{ id: "d" }]),
      teamRoles: failed,
      skills: ok([{ id: "s" }]),
      organizationUsers: ok([{ userId: "a" }, { userId: "b" }]),
    });

    // The answer exists and we did not get it, so claiming the basics are in
    // place would assert something nobody checked. Different from the
    // first-project step, whose signal never existed and so cannot block it.
    expect(step(setup, "team-roles").state).toBe("unavailable");
    expect(setup.settled).toBe(false);
  });

  it("stays settleable despite the permanently unknown step", () => {
    const setup = build({
      departments: ok([{ id: "d" }]),
      teamRoles: ok([{ id: "t" }]),
      skills: ok([{ id: "s" }]),
      organizationUsers: ok([{ userId: "a" }, { userId: "b" }]),
    });

    // If structural unknown blocked settled, settled could never be true.
    expect(step(setup, "first-project").state).toBe("unknown");
    expect(setup.settled).toBe(true);
  });
});

describe("what the model refuses to invent", () => {
  it("exposes no percentage, score or completion count", () => {
    const setup = build();
    const serialised = JSON.stringify(setup);

    expect(serialised).not.toMatch(/percent|progress|score|complete[dD]?Count/);
    expect(Object.keys(setup).sort()).toEqual(["settled", "steps"]);
  });
});

/**
 * The founder cannot create a project, and the checklist has to say so.
 *
 * `POST /projects` is PROJECT_MANAGER-only while registering an organization
 * grants `EMPLOYEE` and `ORGANIZATION_ADMIN`. A step that sent a founder to a
 * form the backend would refuse is a step that cannot be completed by following
 * it — which is the one thing this checklist must never contain.
 */
describe("the first-project step", () => {
  it("sends an account without the role to the prerequisite, not to the form", () => {
    const first = step(build({ canCreateProject: false }), "first-project");

    expect(first.actionHref).toBe("/people");
    expect(first.actionLabel).toBe("Get the Project Manager role");
  });

  it("names the role and the window in which it can be self-assigned", () => {
    const first = step(build({ canCreateProject: false }), "first-project");

    expect(first.rationale).toContain("Project Manager role");
    // The self-grant closes as soon as a second person joins, so the copy must
    // not present it as always available.
    expect(first.rationale).toContain("only member");
  });

  it("sends a project manager straight to the form", () => {
    const first = step(build({ canCreateProject: true }), "first-project");

    expect(first.actionHref).toBe("/projects/new");
    expect(first.actionLabel).toBe("Create project");
  });

  it("stays unknown either way, because no organization-wide project read exists", () => {
    expect(step(build({ canCreateProject: false }), "first-project").state).toBe("unknown");
    expect(step(build({ canCreateProject: true }), "first-project").state).toBe("unknown");
  });

  it("does not let create authority affect whether the workspace is settled", () => {
    const done = { departments: ok([1]), teamRoles: ok([1]), skills: ok([1]),
      organizationUsers: ok([{ userId: "founder" }, { userId: "other" }]) };

    expect(build({ ...done, canCreateProject: false }).settled).toBe(true);
    expect(build({ ...done, canCreateProject: true }).settled).toBe(true);
  });
});
