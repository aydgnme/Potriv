import type { Loaded } from "../server/homeDataSources";

/**
 * The founder's setup guidance, derived only from data the product really has.
 *
 * Every step here is one of four things, and keeping the last two apart is the
 * whole point:
 *
 * - **done** — a real read said so
 * - **todo** — a real read said it has not happened
 * - **unknown** — no truthful signal exists at all, so nothing is claimed
 * - **unavailable** — a signal exists, but the read for it did not answer
 *
 * `unknown` and `unavailable` look similar and mean opposite things. `unknown`
 * is permanent: there is no organization-wide project read, because
 * `GET /projects/managed` is scoped to projects the caller manages and
 * `GET /me/projects` to projects they are on — so an administrator who manages
 * nothing would see "no projects" for a workspace full of them. A checkmark
 * derived from that would be a lie and its absence would be a different lie,
 * so the step makes no completion claim and says so.
 *
 * `unavailable` is temporary: Potriv knows exactly how to answer the question
 * and could not reach the answer this time. Telling somebody that a department
 * check is "not tracked" because `/departments` timed out would be describing a
 * permanent gap in the product to explain a momentary one in the network.
 *
 * There is deliberately no percentage, no score and no "3 of 5". The backend
 * has no concept of workspace completeness, so inventing a number would be
 * inventing a product fact.
 */

export type SetupStepState = "done" | "todo" | "unknown" | "unavailable";

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
   * True only when every answerable step has been answered, and answered done.
   *
   * `unknown` cannot block it — that signal does not exist and never will, so
   * holding it against the workspace would mean `settled` could never be true.
   *
   * `unavailable` must block it. The answer exists and we did not get it, so
   * saying the basics are in place would be asserting something nobody checked.
   */
  readonly settled: boolean;
};

/**
 * Turns a loaded list into a completion signal.
 *
 * A failed or forbidden read becomes `unavailable`, never `todo`: "we could not
 * ask" and "the answer is no" are different, and only one of them should put a
 * task in front of somebody. It is not `unknown` either — the question is
 * answerable, just not right now.
 */
function existence(loaded: Loaded<readonly unknown[]> | null): SetupStepState {
  if (!loaded || !loaded.ok) return "unavailable";
  return loaded.value.length > 0 ? "done" : "todo";
}

export function buildWorkspaceSetup(input: {
  readonly departments: Loaded<readonly unknown[]> | null;
  readonly teamRoles: Loaded<readonly unknown[]> | null;
  readonly skills: Loaded<readonly unknown[]> | null;
  readonly organizationUsers: Loaded<readonly unknown[]> | null;
  /**
   * Whether this account holds `PROJECT_MANAGER`.
   *
   * Not a completion signal — it changes where the first-project step *sends*
   * somebody. See the step itself for why an organization admin routinely does
   * not hold it.
   */
  readonly canCreateProject: boolean;
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
      /**
       * Creating a project needs `PROJECT_MANAGER`, and a founder does not have
       * it.
       *
       * `POST /projects` sits behind `@ProjectManagerOnly`, while registering an
       * organization grants `EMPLOYEE` and `ORGANIZATION_ADMIN` and nothing else.
       * Administering the workspace and managing projects are separate
       * authorities, and the backend keeps them separate.
       *
       * The path out is real but narrow: while the founder is the *only* member,
       * they may add `PROJECT_MANAGER` to their own account from People. That
       * window closes the moment somebody else joins — so the step says so
       * rather than sending them to a form that would refuse them.
       *
       * Sending an account without the role to `/projects/new` would be a step
       * that cannot be completed by following it, which is exactly what this
       * checklist must never contain.
       */
      rationale: input.canCreateProject
        ? "Define the work before looking for the people to do it."
        : "Creating a project needs the Project Manager role, which this account does not "
          + "have. While you are the only member you can add it to yourself from People.",
      // No organization-wide project read exists — see the note above.
      state: "unknown",
      actionLabel: input.canCreateProject ? "Create project" : "Get the Project Manager role",
      actionHref: input.canCreateProject ? "/projects/new" : "/people",
    },
  ];

  // A step with no signal at all is excluded; one whose read failed is not,
  // because it is answerable and simply unanswered — so it blocks `settled`.
  const answerable = steps.filter((step) => step.state !== "unknown");
  return {
    steps,
    settled:
      answerable.length > 0 && answerable.every((step) => step.state === "done"),
  };
}
