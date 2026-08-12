import type { ProjectStatus } from "@/shared/types/projectStatus";

/**
 * Only the fields the Projects list renders, named exactly as the backend
 * returns them.
 *
 * Narrow on purpose. There is no field here for capacity, utilisation, risk,
 * project health or an organization-wide count — the backend exposes none of
 * them, so no code path could accidentally display one.
 */

/** `FIXED` runs to a deadline; `ONGOING` legitimately has none. */
export type ProjectPeriod = "FIXED" | "ONGOING";

/**
 * A team role as some backend payload reports it.
 *
 * `active` travels with the role everywhere it appears, because a role recorded
 * on an allocation stays true after the role is retired. Dropping the flag would
 * leave the UI unable to say why a name looks unfamiliar; hiding the role would
 * be worse, since the allocation genuinely carried it.
 */
export type TeamRoleSummary = {
  readonly teamRoleId: string;
  readonly name: string;
  readonly active: boolean;
};

/**
 * A project technology.
 *
 * These are free-text records on the project, not Skill catalogue entries, and
 * they are read live rather than snapshotted per allocation.
 */
export type ProjectTechnologySummary = {
  readonly technologyId: string;
  readonly name: string;
};

/** `GET /projects/managed` — `ProjectResponse`, trimmed to the list columns. */
export type ManagedProject = {
  readonly projectId: string;
  readonly name: string;
  readonly status: ProjectStatus;
  readonly period: ProjectPeriod;
  readonly startDate: string | null;
  readonly deadlineDate: string | null;
};

/**
 * A managed project with its staffing resolved.
 *
 * `openStaffingSlots` is null only when the row's `details` request failed.
 * Every row in the active list is attempted, so null means "we tried and could
 * not tell", which the UI states plainly instead of showing a zero that would
 * read as a fully staffed team.
 */
export type ManagedProjectWithStaffing = ManagedProject & {
  readonly openStaffingSlots: number | null;
};

/** `GET /projects/{projectId}/details` — only what the staffing gap needs. */
export type ProjectStaffingDetails = {
  readonly teamRoleRequirements: readonly {
    readonly teamRole: { readonly teamRoleId: string };
    readonly requiredMembers: number;
  }[];
  readonly activeMembers: readonly {
    readonly roles: readonly { readonly teamRoleId: string }[];
  }[];
};

/**
 * `GET /department/projects` — `DepartmentProjectsResponse`.
 *
 * `teamMembers` holds the **managed department's** active allocations on that
 * project, never the full cross-department team. Labelling it as the project
 * team would overstate what the manager can see.
 */
export type DepartmentProjectMember = {
  readonly allocationId: string;
  /** The proposal this allocation came from. No product route opens one. */
  readonly assignmentProposalId: string;
  readonly employee: {
    readonly userId: string;
    readonly name: string;
    readonly email: string;
  };
  readonly workHoursPerDay: number;
  readonly roles: readonly TeamRoleSummary[];
  /** When this allocation began. There is no end: the portfolio is active-only. */
  readonly allocatedAt: string;
};

export type DepartmentProject = {
  readonly projectId: string;
  readonly projectName: string;
  readonly status: ProjectStatus;
  readonly period: ProjectPeriod;
  /** A project always has a start date; only the deadline is optional. */
  readonly startDate: string;
  readonly deadlineDate: string | null;
  readonly teamMembers: readonly DepartmentProjectMember[];
};

export type DepartmentProjects = {
  readonly department: { readonly departmentId: string; readonly name: string };
  readonly projects: readonly DepartmentProject[];
  /** When the backend answered. Not a last-updated or last-synced time. */
  readonly generatedAt: string;
};

/**
 * `GET /me/projects` — one entry per **allocation episode**, not per project.
 *
 * Somebody can be allocated to the same project twice, and both episodes are
 * true. `allocationId` identifies the row; `projectId` does not, and
 * deduplicating by it would silently delete part of a person's history.
 */
export type MyProjectEpisode = {
  readonly allocationId: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly projectStatus: ProjectStatus;
  readonly projectPeriod: ProjectPeriod;
  readonly startDate: string;
  readonly deadlineDate: string | null;
  readonly workHoursPerDay: number;
  /** This episode's approved roles. A later episode may carry different ones. */
  readonly roles: readonly TeamRoleSummary[];
  /**
   * The project's technologies, read when the request was made.
   *
   * Not a record of what this person used during the allocation, and not a
   * snapshot taken when it ended — the backend reads them live off the project,
   * so a technology added yesterday appears against a decade-old episode.
   */
  readonly technologyStack: readonly ProjectTechnologySummary[];
  readonly allocatedAt: string;
  /** Set on past episodes: when the allocation ended, not how it went. */
  readonly deallocatedAt: string | null;
};

/**
 * The whole self-scoped history response.
 *
 * The identity fields say whose history this is; the endpoint accepts no user
 * parameter, so they can only ever describe the caller.
 */
export type MyProjects = {
  readonly userId: string;
  readonly userName: string;
  readonly userEmail: string;
  readonly currentProjects: readonly MyProjectEpisode[];
  readonly pastProjects: readonly MyProjectEpisode[];
  /** When the backend answered. Not a last-updated or last-synced time. */
  readonly generatedAt: string;
};
