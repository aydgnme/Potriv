import "server-only";

import { backendGet } from "@/modules/auth/server-public";

import type {
  DepartmentProjects,
  ManagedProject,
  MyProjects,
  MySkill,
  OrganizationDepartment,
  OrganizationUser,
  PendingProposal,
  ProjectStaffingDetails,
} from "../model/homeData";

/**
 * Every backend read Home performs, one typed function each.
 *
 * Components never call `fetch`: a section asks for what it needs and gets it or
 * a failure, so no React file has to know a backend exists. Each function names
 * the endpoint it uses so the mapping stays checkable against the traceability
 * matrix.
 */

/**
 * Why a section has no data.
 *
 * `FORBIDDEN` is not a failure. A department-scoped endpoint answers 403 when
 * the caller holds DEPARTMENT_MANAGER but manages no department — holding a role
 * is not the same as having authority over a record. Telling that person
 * "could not load, try again" would describe an outage that is not happening, so
 * the distinction is carried here rather than flattened away.
 */
export type LoadFailure = "FORBIDDEN" | "ERROR";

export type Loaded<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: LoadFailure };

async function load<T>(path: string): Promise<Loaded<T>> {
  const outcome = await backendGet<T>(path);
  if (outcome.ok) return { ok: true, value: outcome.value };
  return { ok: false, reason: outcome.error.status === 403 ? "FORBIDDEN" : "ERROR" };
}

/** `GET /me/projects` — every authenticated product user. */
export function getMyProjects(): Promise<Loaded<MyProjects>> {
  return load<MyProjects>("/me/projects");
}

/** `GET /me/skills` — every authenticated product user. */
export function getMySkills(): Promise<Loaded<readonly MySkill[]>> {
  return load<readonly MySkill[]>("/me/skills");
}

/** `GET /projects/managed` — PROJECT_MANAGER only. */
export function getManagedProjects(): Promise<Loaded<readonly ManagedProject[]>> {
  return load<readonly ManagedProject[]>("/projects/managed");
}

/** `GET /projects/{projectId}/details` — used only for the bounded shortlist. */
export function getProjectStaffingDetails(
  projectId: string,
): Promise<Loaded<ProjectStaffingDetails>> {
  return load<ProjectStaffingDetails>(`/projects/${projectId}/details`);
}

/** `GET /department/project-proposals?status=PENDING` — DEPARTMENT_MANAGER only. */
export function getPendingDepartmentProposals(): Promise<Loaded<readonly PendingProposal[]>> {
  return load<readonly PendingProposal[]>("/department/project-proposals?status=PENDING");
}

/** `GET /department/projects` — DEPARTMENT_MANAGER only. */
export function getDepartmentProjects(): Promise<Loaded<DepartmentProjects>> {
  return load<DepartmentProjects>("/department/projects");
}

/** `GET /departments` — ORGANIZATION_ADMIN only. */
export function getDepartments(): Promise<Loaded<readonly OrganizationDepartment[]>> {
  return load<readonly OrganizationDepartment[]>("/departments");
}

/** `GET /users` — ORGANIZATION_ADMIN only. */
export function getOrganizationUsers(): Promise<Loaded<readonly OrganizationUser[]>> {
  return load<readonly OrganizationUser[]>("/users");
}

/** The full set, so the composer can be tested against fakes. */
export type HomeDataSources = {
  readonly getMyProjects: typeof getMyProjects;
  readonly getMySkills: typeof getMySkills;
  readonly getManagedProjects: typeof getManagedProjects;
  readonly getProjectStaffingDetails: typeof getProjectStaffingDetails;
  readonly getPendingDepartmentProposals: typeof getPendingDepartmentProposals;
  readonly getDepartmentProjects: typeof getDepartmentProjects;
  readonly getDepartments: typeof getDepartments;
  readonly getOrganizationUsers: typeof getOrganizationUsers;
};

export const HOME_DATA_SOURCES: HomeDataSources = {
  getMyProjects,
  getMySkills,
  getManagedProjects,
  getProjectStaffingDetails,
  getPendingDepartmentProposals,
  getDepartmentProjects,
  getDepartments,
  getOrganizationUsers,
};
