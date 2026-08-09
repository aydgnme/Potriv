import "server-only";

import { backendGet } from "@/modules/auth/server-public";

import type { ProjectStatusFilter } from "../model/projectsQuery";
import type {
  DepartmentProjects,
  ManagedProject,
  MyProjects,
  ProjectStaffingDetails,
} from "../model/projectsData";

/**
 * Every backend read the Projects list performs, one typed function each.
 *
 * Components never call `fetch`: a view asks for what it needs and gets it or a
 * failure, so no React file has to know a backend exists. Each function names
 * the endpoint it uses so the mapping stays checkable against the traceability
 * matrix.
 */

/**
 * Why a scope has no data.
 *
 * `FORBIDDEN` is not a failure. `GET /department/projects` answers 403 when the
 * caller holds DEPARTMENT_MANAGER but manages no department — holding a role is
 * not the same as having authority over a record. Telling that person "could not
 * load, try again" would describe an outage that is not happening, so the
 * distinction is carried here rather than flattened away.
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

/**
 * The only status the backend is ever asked about is one of its own enum values.
 *
 * The filter has already been narrowed to a closed union by
 * `normalizeProjectsQuery`, so this cannot append user input to a path; the
 * encoding is belt and braces.
 */
function withStatus(path: string, status: ProjectStatusFilter): string {
  return status ? `${path}?status=${encodeURIComponent(status)}` : path;
}

/** `GET /projects/managed[?status=]` — PROJECT_MANAGER's own projects, never organization-wide. */
export function getManagedProjects(
  status: ProjectStatusFilter,
): Promise<Loaded<readonly ManagedProject[]>> {
  return load<readonly ManagedProject[]>(withStatus("/projects/managed", status));
}

/** `GET /department/projects[?status=]` — the department this user actually manages. */
export function getDepartmentProjects(
  status: ProjectStatusFilter,
): Promise<Loaded<DepartmentProjects>> {
  return load<DepartmentProjects>(withStatus("/department/projects", status));
}

/**
 * `GET /me/projects` — allocation history for the signed-in person.
 *
 * No status parameter exists on this endpoint, so the filter is applied in the
 * server-side frontend layer instead of being faked into the URL.
 */
export function getMyProjects(): Promise<Loaded<MyProjects>> {
  return load<MyProjects>("/me/projects");
}

/** `GET /projects/{projectId}/details` — one request per managed row, bounded by the caller. */
export function getProjectStaffingDetails(
  projectId: string,
): Promise<Loaded<ProjectStaffingDetails>> {
  return load<ProjectStaffingDetails>(`/projects/${encodeURIComponent(projectId)}/details`);
}

/** The full set, so the loader can be tested against fakes. */
export type ProjectsDataSources = {
  readonly getManagedProjects: typeof getManagedProjects;
  readonly getDepartmentProjects: typeof getDepartmentProjects;
  readonly getMyProjects: typeof getMyProjects;
  readonly getProjectStaffingDetails: typeof getProjectStaffingDetails;
};

export const PROJECTS_DATA_SOURCES: ProjectsDataSources = {
  getManagedProjects,
  getDepartmentProjects,
  getMyProjects,
  getProjectStaffingDetails,
};
