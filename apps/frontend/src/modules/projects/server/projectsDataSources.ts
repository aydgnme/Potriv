import "server-only";

import { backendGet } from "@/modules/auth/server-public";

import type { ProjectStatusFilter } from "../model/projectsQuery";
import type {
  ManagedProjectDetail,
  ProjectDetails,
  ProjectTeam,
  TeamRoleCatalogueEntry,
} from "../model/projectDetail";
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
 * Why a read produced nothing.
 *
 * `FORBIDDEN` is not a failure. `GET /department/projects` answers 403 when the
 * caller holds DEPARTMENT_MANAGER but manages no department — holding a role is
 * not the same as having authority over a record. Telling that person "could not
 * load, try again" would describe an outage that is not happening, so the
 * distinction is carried here rather than flattened away.
 *
 * `NOT_FOUND` is deliberately ambiguous, because the backend's 404 is. A project
 * that does not exist and a project the caller has no relationship to answer
 * identically on purpose, so that being refused never reveals that something is
 * there. The UI must keep them indistinguishable too.
 */
export type LoadFailure = "FORBIDDEN" | "NOT_FOUND" | "ERROR";

export type Loaded<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: LoadFailure };

async function load<T>(path: string): Promise<Loaded<T>> {
  const outcome = await backendGet<T>(path);
  if (outcome.ok) return { ok: true, value: outcome.value };
  return { ok: false, reason: failureFor(outcome.error.status) };
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

function failureFor(status: number): LoadFailure {
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  return "ERROR";
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

/**
 * `GET /projects/{projectId}/details` — the relationship-aware read.
 *
 * Answers for the owning manager, a current or past member, or an involved
 * department manager. Anyone else gets 404 rather than 403, so nobody learns a
 * project exists by being refused it.
 */
export function getProjectDetails(projectId: string): Promise<Loaded<ProjectDetails>> {
  return load<ProjectDetails>(`/projects/${encodeURIComponent(projectId)}/details`);
}

/** `GET /projects/{projectId}/team` — same relationship rule as details. */
export function getProjectTeam(projectId: string): Promise<Loaded<ProjectTeam>> {
  return load<ProjectTeam>(`/projects/${encodeURIComponent(projectId)}/team`);
}

/**
 * `GET /projects/{projectId}` — the owner's management representation.
 *
 * Editing prefills from this, not from `/details`: details is what a reader sees,
 * and a form built from it would silently mean something different.
 */
export function getManagedProject(projectId: string): Promise<Loaded<ManagedProjectDetail>> {
  return load<ManagedProjectDetail>(`/projects/${encodeURIComponent(projectId)}`);
}

/**
 * `GET /team-roles[?includeInactive=true]` — the collection read a project
 * manager is allowed.
 *
 * Never `GET /team-roles/{id}`: that detail endpoint is organization-admin only,
 * and the collection already carries everything a project form needs.
 */
export function getTeamRoleCatalogue(
  includeInactive: boolean,
): Promise<Loaded<readonly TeamRoleCatalogueEntry[]>> {
  return load<readonly TeamRoleCatalogueEntry[]>(
    includeInactive ? "/team-roles?includeInactive=true" : "/team-roles",
  );
}

/** The full set, so the loader can be tested against fakes. */
export type ProjectsDataSources = {
  readonly getManagedProjects: typeof getManagedProjects;
  readonly getDepartmentProjects: typeof getDepartmentProjects;
  readonly getMyProjects: typeof getMyProjects;
  readonly getProjectStaffingDetails: typeof getProjectStaffingDetails;
  readonly getProjectDetails: typeof getProjectDetails;
  readonly getProjectTeam: typeof getProjectTeam;
  readonly getManagedProject: typeof getManagedProject;
  readonly getTeamRoleCatalogue: typeof getTeamRoleCatalogue;
};

export const PROJECTS_DATA_SOURCES: ProjectsDataSources = {
  getManagedProjects,
  getDepartmentProjects,
  getMyProjects,
  getProjectStaffingDetails,
  getProjectDetails,
  getProjectTeam,
  getManagedProject,
  getTeamRoleCatalogue,
};
