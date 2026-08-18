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
    // But it still offers the action, because creating one is the right move.
    expect(step(setup, "first-project").actionHref).toBe("/projects/new");
  });

  it("treats a failed read as unknown, never as an outstanding task", () => {
    const setup = build({ departments: failed });

    // "We could not ask" must not become "you have not done this".
    expect(step(setup, "departments").state).toBe("unknown");
    expect(step(setup, "departments").state).not.toBe("todo");
  });

  it("treats a forbidden read as unknown too", () => {
    const setup = build({ teamRoles: forbidden });

    expect(step(setup, "team-roles").state).toBe("unknown");
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

  it("is not settled when a read failed, even if the rest are done", () => {
    const setup = build({
      departments: ok([{ id: "d" }]),
      teamRoles: failed,
      skills: ok([{ id: "s" }]),
      organizationUsers: ok([{ userId: "a" }, { userId: "b" }]),
    });

    // A failed read leaves a genuine unknown; claiming the workspace is set up
    // would be asserting something nobody checked. This is different from the
    // first-project step, whose signal never existed and so cannot block it.
    expect(step(setup, "team-roles").state).toBe("unknown");
    expect(setup.settled).toBe(false);
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
