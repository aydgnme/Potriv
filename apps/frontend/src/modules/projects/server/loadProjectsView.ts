import "server-only";

import { projectAttentionRank } from "@/shared/utils/projectStatus";

import type {
  DepartmentProjects,
  ManagedProjectWithStaffing,
  MyProjects,
} from "../model/projectsData";
import type { ProjectStatusFilter, ProjectsQuery } from "../model/projectsQuery";
import { mapWithConcurrency } from "../utils/mapWithConcurrency";
import { openStaffingSlots } from "../utils/staffingSlots";
import {
  PROJECTS_DATA_SOURCES,
  type Loaded,
  type ProjectsDataSources,
} from "./projectsDataSources";

/**
 * Loads exactly one scope: the one the URL asks for and the role set grants.
 *
 * Hidden scopes are never fetched. Loading them to fill a badge would mean
 * calling a department endpoint for someone looking at their own allocations,
 * paying for data nobody asked to see, and — for a role the user does not hold —
 * sending a request the backend rightly refuses.
 */

/**
 * How many `details` requests may be in flight at once.
 *
 * Staffing costs one request per managed project and there is no aggregate
 * endpoint. Every row in the active list is attempted — reporting unknown
 * staffing for everything past the fifth would be a quieter kind of wrong — but
 * a busy manager's list must not turn into forty simultaneous connections.
 *
 * Small, fixed and server-side: nothing user-supplied reaches it.
 */
export const DETAIL_CONCURRENCY = 5;

export type ProjectsViewData =
  | { readonly view: "managed"; readonly data: Loaded<readonly ManagedProjectWithStaffing[]> }
  | { readonly view: "department"; readonly data: Loaded<DepartmentProjects> }
  | { readonly view: "mine"; readonly data: Loaded<MyProjects> };

export async function loadProjectsView(
  query: ProjectsQuery,
  sources: ProjectsDataSources = PROJECTS_DATA_SOURCES,
): Promise<ProjectsViewData> {
  switch (query.view) {
    case "managed":
      return { view: "managed", data: await loadManaged(query.status, sources) };
    case "department":
      return { view: "department", data: await sources.getDepartmentProjects(query.status) };
    case "mine":
      return { view: "mine", data: await loadMine(query.status, sources) };
  }
}

async function loadManaged(
  status: ProjectStatusFilter,
  sources: ProjectsDataSources,
): Promise<Loaded<readonly ManagedProjectWithStaffing[]>> {
  // The backend owns this filter, so a filtered list is a smaller list — and a
  // smaller staffing fan-out.
  const loaded = await sources.getManagedProjects(status);
  if (!loaded.ok) return loaded;

  // Projects that are actually running come first: a gap on live work is the one
  // worth acting on today. Stable within a rank, so the backend's own ordering
  // survives.
  const ordered = [...loaded.value].sort(
    (left, right) => projectAttentionRank(left.status) - projectAttentionRank(right.status),
  );

  const details = await mapWithConcurrency(ordered, DETAIL_CONCURRENCY, (project) =>
    sources.getProjectStaffingDetails(project.projectId),
  );

  return {
    ok: true,
    value: ordered.map((project, index) => {
      const detail = details[index];

      return {
        ...project,
        // One failed detail costs that row its figure and nothing else. It stays
        // null rather than becoming 0, which would claim a fully staffed team on
        // the strength of a failed request.
        openStaffingSlots: detail?.ok ? openStaffingSlots(detail.value) : null,
      };
    }),
  };
}

async function loadMine(
  status: ProjectStatusFilter,
  sources: ProjectsDataSources,
): Promise<Loaded<MyProjects>> {
  const loaded = await sources.getMyProjects();
  if (!loaded.ok || status === null) return loaded;

  // `/me/projects` has no status parameter, so the filter is applied here rather
  // than invented into the URL. Current and past stay separate: an episode does
  // not change group because of the project's status today, and every episode
  // survives — the same project appearing twice is two real allocations.
  //
  // Filtering removes rows and reorders nothing: `filter` keeps the backend's
  // order, and the identity fields are carried through rather than rebuilt, so a
  // filtered history still says whose it is and when it was read.
  return {
    ok: true,
    value: {
      ...loaded.value,
      currentProjects: loaded.value.currentProjects.filter(
        (episode) => episode.projectStatus === status,
      ),
      pastProjects: loaded.value.pastProjects.filter(
        (episode) => episode.projectStatus === status,
      ),
    },
  };
}
