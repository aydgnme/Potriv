import type { Loaded } from "../server/homeDataSources";

/**
 * The founder's setup guidance, derived only from data the product really has.
 *
 * Every step here is one of three things, and the distinction is the whole
 * point:
 *
 * - **done** — a real read said so
 * - **todo** — a real read said it has not happened
 * - **unknown** — no truthful signal exists, so no claim is made either way
 *
 * `unknown` is not a failure state and not a hidden `todo`. It exists because
 * one step genuinely cannot be answered: there is no organization-wide project
 * read. `GET /projects/managed` is scoped to projects the caller manages and
 * `GET /me/projects` to projects they are on, so an administrator who is not
 * also a project manager would see "no projects" for a workspace full of them.
 * A checkmark derived from that would be a lie, and its absence would be a
 * different lie. The step is shown as an action with no completion claim.
 *
 * There is deliberately no percentage, no score and no "3 of 5". The backend
 * has no concept of workspace completeness, so inventing a number would be
 * inventing a product fact.
 */

export type SetupStepState = "done" | "todo" | "unknown";

export type WorkspaceSetupStep = {
  readonly id: string;
  readonly title: string;
  /** Why this step matters, in one line. */
  readonly rationale: string;
  readonly state: SetupStepState;
  readonly actionLabel: string;
  readonly actionHref: string;
};

export type WorkspaceSetup = {
  readonly steps: readonly WorkspaceSetupStep[];
  /**
   * True only when every step that *can* be answered has been, and every read
   * that should have answered actually did.
   *
   * Two different things produce `unknown`, and they are not equivalent:
   *
   * - **structural** — no signal exists at all, as for the first project. This
   *   is permanent, so holding it against the workspace would mean `settled`
   *   could never be true.
   * - **transient** — a read failed or was refused. Here the answer exists and
   *   we simply did not get it, so claiming the basics are in place would be
   *   asserting something nobody checked.
   *
   * Only the second blocks `settled`.
   */
  readonly settled: boolean;
};

/**
 * Turns a loaded list into a completion signal.
 *
 * A failed or forbidden read is `unknown`, never `todo`: "we could not ask" and
 * "the answer is no" are different, and only one of them should put a task in
 * front of somebody.
 */
function existence(loaded: Loaded<readonly unknown[]> | null): SetupStepState {
  if (!loaded || !loaded.ok) return "unknown";
  return loaded.value.length > 0 ? "done" : "todo";
}

/** A read that was attempted and did not answer — as opposed to one that was
 *  never possible. */
function readFailed(loaded: Loaded<readonly unknown[]> | null): boolean {
  return loaded !== null && !loaded.ok;
}

export function buildWorkspaceSetup(input: {
  readonly departments: Loaded<readonly unknown[]> | null;
  readonly teamRoles: Loaded<readonly unknown[]> | null;
  readonly skills: Loaded<readonly unknown[]> | null;
  readonly organizationUsers: Loaded<readonly unknown[]> | null;
}): WorkspaceSetup {
  const steps: WorkspaceSetupStep[] = [
    {
      id: "departments",
      title: "Add a department",
      rationale: "Departments own people and review the staffing asked of them.",
      state: existence(input.departments),
      actionLabel: "Add department",
      actionHref: "/organization/departments",
    },
    {
      id: "team-roles",
      title: "Define team roles",
      rationale: "The vocabulary projects use to say what they need.",
      state: existence(input.teamRoles),
      actionLabel: "Manage team roles",
      actionHref: "/organization/team-roles",
    },
    {
      id: "skills",
      title: "Build the skill catalogue",
      rationale: "Team Finder matches against these, so an empty catalogue finds nobody.",
      state: existence(input.skills),
      actionLabel: "Manage skills",
      actionHref: "/skills",
    },
    {
      id: "members",
      /**
       * Titled for what the signal actually measures. `GET /users` returns
       * organization members, not invitations, so more than one member means
       * *somebody joined* — it cannot tell whether an invite was ever sent, and
       * calling it "invite sent" would describe a fact nobody checked.
       */
      title: "Bring in your team",
      rationale: "Complete once somebody else has joined the workspace.",
      state: existence(
        input.organizationUsers && input.organizationUsers.ok
          ? // More than one member means another person is here — the founder
            // alone is not a team.
            { ok: true, value: input.organizationUsers.value.slice(1) }
          : input.organizationUsers,
      ),
      actionLabel: "Invite people",
      actionHref: "/organization/invite",
    },
    {
      id: "first-project",
      title: "Create your first project",
      rationale: "Define the work before looking for the people to do it.",
      // No organization-wide project read exists — see the note above.
      state: "unknown",
      actionLabel: "Create project",
      actionHref: "/projects/new",
    },
  ];

  const anyReadFailed = [
    input.departments,
    input.teamRoles,
    input.skills,
    input.organizationUsers,
  ].some(readFailed);

  const answerable = steps.filter((step) => step.state !== "unknown");
  return {
    steps,
    settled:
      !anyReadFailed &&
      answerable.length > 0 &&
      answerable.every((step) => step.state === "done"),
  };
}
