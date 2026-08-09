import type { ProjectStatus } from "@/shared/types/projectStatus";

import type { ProjectPeriod, TeamRoleSummary } from "./projectsData";

/**
 * The two relationship-aware project reads, and the owner-scoped one.
 *
 * `/details` and `/team` answer for anyone the backend considers related to the
 * project — the owning manager, a current or past member, an involved department
 * manager. `GET /projects/{id}` answers only for the owner and is the management
 * representation, which is why editing prefills from it rather than from details.
 */

export type UserSummary = {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
};

export type DepartmentSummary = {
  readonly departmentId: string;
  readonly name: string;
};

/** A role as it was recorded on an allocation, including whether it still exists. */
export type MemberRole = TeamRoleSummary & { readonly active: boolean };

/** `GET /projects/{projectId}/details` */
export type ProjectDetails = {
  readonly projectId: string;
  readonly projectName: string;
  readonly projectStatus: ProjectStatus;
  readonly projectPeriod: ProjectPeriod;
  readonly startDate: string | null;
  readonly deadlineDate: string | null;
  readonly generalDescription: string | null;
  readonly projectManager: UserSummary;
  readonly technologyStack: readonly { readonly technologyId: string; readonly name: string }[];
  readonly teamRoleRequirements: readonly {
    readonly requirementId: string;
    readonly teamRole: MemberRole;
    readonly requiredMembers: number;
  }[];
  readonly activeMembers: readonly DetailsMember[];
  readonly pastMembers: readonly DetailsPastMember[];
};

export type DetailsMember = {
  readonly allocationId: string;
  readonly employee: UserSummary;
  readonly reviewDepartment: DepartmentSummary | null;
  readonly workHoursPerDay: number;
  readonly roles: readonly MemberRole[];
  readonly allocatedAt: string | null;
};

export type DetailsPastMember = DetailsMember & {
  readonly deallocatedAt: string | null;
};

/** `GET /projects/{projectId}/team` */
export type ProjectTeam = {
  readonly projectId: string;
  readonly projectName: string;
  readonly projectStatus: ProjectStatus;
  readonly projectPeriod: ProjectPeriod;
  readonly startDate: string | null;
  readonly deadlineDate: string | null;
  readonly proposedMembers: readonly ProposedMember[];
  readonly activeMembers: readonly ActiveMember[];
  readonly pastMembers: readonly PastMember[];
};

/**
 * A pending assignment proposal. Nobody is allocated yet — a department manager
 * still has to decide — so these never appear alongside active members.
 */
export type ProposedMember = {
  readonly proposalId: string;
  readonly employee: UserSummary;
  readonly reviewDepartment: DepartmentSummary | null;
  readonly workHoursPerDay: number;
  readonly roles: readonly MemberRole[];
  readonly comments: string | null;
  readonly proposedBy: UserSummary | null;
  readonly proposedAt: string | null;
};

export type ActiveMember = {
  readonly allocationId: string;
  readonly employee: UserSummary;
  readonly reviewDepartment: DepartmentSummary | null;
  readonly workHoursPerDay: number;
  readonly roles: readonly MemberRole[];
  readonly allocatedAt: string | null;
  readonly proposedBy: UserSummary | null;
  readonly approvedBy: UserSummary | null;
  readonly approvedAt: string | null;
};

/** Every deallocation field is nullable: the record may predate the workflow. */
export type PastMember = {
  readonly allocationId: string;
  readonly employee: UserSummary;
  readonly reviewDepartment: DepartmentSummary | null;
  readonly workHoursPerDay: number;
  readonly roles: readonly MemberRole[];
  readonly allocatedAt: string | null;
  readonly deallocatedAt: string | null;
  readonly deallocationReason: string | null;
  readonly deallocationProposedBy: UserSummary | null;
  readonly deallocationApprovedBy: UserSummary | null;
  readonly deallocationApprovedAt: string | null;
};

/** `GET /projects/{projectId}` — the owner's management representation. */
export type ManagedProjectDetail = {
  readonly projectId: string;
  readonly name: string;
  readonly status: ProjectStatus;
  readonly period: ProjectPeriod;
  readonly startDate: string | null;
  readonly deadlineDate: string | null;
  readonly generalDescription: string | null;
  readonly technologyStack: readonly string[];
  readonly teamRoles: readonly {
    readonly teamRoleId: string;
    readonly name: string;
    readonly active: boolean;
    readonly requiredMembers: number;
  }[];
};

/** `GET /team-roles[?includeInactive=true]` — the catalogue, collection read only. */
export type TeamRoleCatalogueEntry = {
  readonly teamRoleId: string;
  readonly name: string;
  readonly description: string | null;
  readonly active: boolean;
};
