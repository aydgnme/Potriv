import "server-only";

import type { AccessRole } from "@/shared/types/accessRole";

import type {
  ManagedProjectDetail,
  ProjectDetails,
  ProjectTeam,
  TeamRoleCatalogueEntry,
} from "../model/projectDetail";
import {
  PROJECTS_DATA_SOURCES,
  type Loaded,
  type ProjectsDataSources,
} from "./projectsDataSources";

/**
 * What each project screen loads, and — as importantly — what it does not.
 *
 * Overview and Team use the relationship-aware reads, so they answer for anyone
 * the backend considers related to the project. Editing uses the owner-scoped
 * management read. Nothing here asks a PM-only endpoint on behalf of someone who
 * is only a reader.
 */

export function loadProjectOverview(
  projectId: string,
  sources: ProjectsDataSources = PROJECTS_DATA_SOURCES,
): Promise<Loaded<ProjectDetails>> {
  return sources.getProjectDetails(projectId);
}

export function loadProjectTeamView(
  projectId: string,
  sources: ProjectsDataSources = PROJECTS_DATA_SOURCES,
): Promise<Loaded<ProjectTeam>> {
  return sources.getProjectTeam(projectId);
}

export type ProjectEditorData = {
  readonly project: Loaded<ManagedProjectDetail>;
  readonly catalogue: Loaded<readonly TeamRoleCatalogueEntry[]>;
};

/**
 * The two halves of the settings form, loaded together.
 *
 * The catalogue is fetched with `includeInactive=true` because a project may
 * still require a role that was deactivated afterwards, and a form that could not
 * name it would have to drop it.
 *
 * Both halves are required. This screen submits a **complete** definition, so a
 * catalogue that failed to load would leave the form unable to tell an inactive
 * role from an unknown one — and saving anyway would quietly replace the
 * project's requirements with whatever survived. Save stays blocked instead.
 */
export async function loadProjectEditor(
  projectId: string,
  sources: ProjectsDataSources = PROJECTS_DATA_SOURCES,
): Promise<ProjectEditorData> {
  const [project, catalogue] = await Promise.all([
    sources.getManagedProject(projectId),
    sources.getTeamRoleCatalogue(true),
  ]);

  return { project, catalogue };
}

/**
 * The create form's only dependency.
 *
 * Active roles only: a new project cannot require a role nobody may be given.
 */
export function loadCreateForm(
  sources: ProjectsDataSources = PROJECTS_DATA_SOURCES,
): Promise<Loaded<readonly TeamRoleCatalogueEntry[]>> {
  return sources.getTeamRoleCatalogue(false);
}

/**
 * Whether this session may manage this project.
 *
 * Holding `PROJECT_MANAGER` says someone can manage projects; it does not say
 * they manage *this* one. Management controls need both, and the second half is
 * the project's own manager id — never inferred from the role alone.
 */
export function ownsProject(
  roles: readonly AccessRole[],
  userId: string,
  projectManagerId: string | null | undefined,
): boolean {
  return (
    roles.includes("PROJECT_MANAGER") &&
    projectManagerId !== null &&
    projectManagerId !== undefined &&
    projectManagerId === userId
  );
}
