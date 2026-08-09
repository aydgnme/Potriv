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

export type TeamRoleSummary = {
  readonly teamRoleId: string;
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
  readonly employee: { readonly userId: string; readonly name: string };
  readonly workHoursPerDay: number;
  readonly roles: readonly TeamRoleSummary[];
};

export type DepartmentProject = {
  readonly projectId: string;
  readonly projectName: string;
  readonly status: ProjectStatus;
  readonly period: ProjectPeriod;
  readonly startDate: string | null;
  readonly deadlineDate: string | null;
  readonly teamMembers: readonly DepartmentProjectMember[];
};

export type DepartmentProjects = {
  readonly department: { readonly departmentId: string; readonly name: string };
  readonly projects: readonly DepartmentProject[];
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
  readonly startDate: string | null;
  readonly deadlineDate: string | null;
  readonly workHoursPerDay: number;
  readonly roles: readonly TeamRoleSummary[];
  readonly allocatedAt: string | null;
  /** Set on past episodes: when the allocation ended, not how it went. */
  readonly deallocatedAt: string | null;
};

export type MyProjects = {
  readonly currentProjects: readonly MyProjectEpisode[];
  readonly pastProjects: readonly MyProjectEpisode[];
};
