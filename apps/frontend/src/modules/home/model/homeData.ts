import type { AccessRole } from "@/shared/types/accessRole";
import type { ProjectStatus } from "@/shared/types/projectStatus";

/**
 * Only the fields Home renders, named exactly as the backend returns them.
 *
 * Narrow on purpose. There is no field here for capacity, utilisation,
 * notifications, account status or an organization-wide project count — the
 * backend does not expose any of them, so Home has no code path that could
 * accidentally display one.
 */


/** `GET /me/projects` */
export type MyProjectItem = {
  readonly projectId: string;
  readonly projectName: string;
  readonly projectStatus: ProjectStatus;
  readonly deadlineDate: string | null;
  readonly workHoursPerDay: number;
  readonly roles: readonly { readonly teamRoleId: string; readonly name: string }[];
};

export type MyProjects = {
  readonly currentProjects: readonly MyProjectItem[];
  readonly pastProjects: readonly MyProjectItem[];
};

/** `GET /me/skills` — levels and experience carry backend-supplied labels. */
export type MySkill = {
  readonly employeeSkillId: string;
  readonly skill: { readonly skillId: string; readonly name: string };
  readonly level: { readonly label: string };
  readonly experience: { readonly label: string };
};

/** `GET /projects/managed` */
export type ManagedProject = {
  readonly projectId: string;
  readonly name: string;
  readonly status: ProjectStatus;
  readonly deadlineDate: string | null;
  readonly teamRoles: readonly { readonly teamRoleId: string; readonly requiredMembers: number }[];
};

/** `GET /projects/{projectId}/details` — only what the staffing gap needs. */
export type ProjectStaffingDetails = {
  readonly projectId: string;
  readonly teamRoleRequirements: readonly {
    readonly teamRole: { readonly teamRoleId: string };
    readonly requiredMembers: number;
  }[];
  readonly activeMembers: readonly {
    readonly roles: readonly { readonly teamRoleId: string }[];
  }[];
};

/** A managed project with its staffing resolved, where the detail could be loaded. */
export type ManagedProjectWithStaffing = ManagedProject & {
  /**
   * Open staffing positions across every declared role requirement. Null when
   * the detail was not loaded — never guessed at, and never defaulted to 0,
   * which would read as a fully staffed team.
   */
  readonly openStaffingSlots: number | null;
};

/** `GET /department/project-proposals?status=PENDING` */
export type PendingProposal = {
  readonly proposalId: string;
  readonly proposalType: string;
  readonly project: { readonly projectId: string; readonly name: string };
  readonly employee: { readonly name: string };
  readonly workHoursPerDay: number | null;
  readonly createdAt: string;
};

/** `GET /department/projects` */
export type DepartmentProjects = {
  readonly department: { readonly name: string };
  readonly projects: readonly {
    readonly projectId: string;
    readonly projectName: string;
    readonly status: ProjectStatus;
    readonly teamMembers: readonly unknown[];
  }[];
};

/** `GET /departments` */
export type OrganizationDepartment = {
  readonly departmentId: string;
  readonly name: string;
  /** Null when nobody manages it — the actionable case. */
  readonly manager: { readonly name: string } | null;
  readonly memberCount: number;
};

/** `GET /users` — counted only; no status field exists to display. */
export type OrganizationUser = {
  readonly userId: string;
  readonly roles: readonly AccessRole[];
};

/**
 * `GET /team-roles` — organization admin or project manager.
 *
 * Read for one question only: does the organization have any team roles yet?
 * Nothing on Home renders a team role, so only existence is modelled.
 */
export type OrganizationTeamRole = {
  readonly teamRoleId: string;
  readonly name: string;
};

/**
 * `GET /skills` — the organization's skill catalogue.
 *
 * Deliberately not `/me/skills`, which is the signed-in person's own declared
 * skills. A founder with three skills on their profile has not built a
 * catalogue, and inferring one from the other would be a lying checkmark.
 */
export type OrganizationSkill = {
  readonly skillId: string;
  readonly name: string;
};
