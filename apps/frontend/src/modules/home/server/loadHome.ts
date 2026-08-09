import "server-only";

import type { AccessRole } from "@/shared/types/accessRole";
import { projectAttentionRank } from "@/shared/utils/projectStatus";

import type {
  DepartmentProjects,
  ManagedProjectWithStaffing,
  MyProjects,
  MySkill,
  OrganizationDepartment,
  OrganizationUser,
  PendingProposal,
} from "../model/homeData";
import { openStaffingSlots } from "../utils/staffingGap";
import { HOME_DATA_SOURCES, type HomeDataSources, type Loaded } from "./homeDataSources";

/**
 * Loads exactly the data the signed-in user's roles entitle them to.
 *
 * Two rules shape this:
 *
 * **Gate before fetching.** A role-specific endpoint is never called for a user
 * who lacks the role. Firing the request and swallowing the 403 would be a
 * request the backend rightly refuses, repeated on every page load, and it would
 * quietly make capability depend on error handling.
 *
 * **A failed section is a failed section.** Every load is independent, so one
 * unavailable endpoint leaves the rest of Home intact. Only the affected panel
 * says so.
 */

/**
 * How many managed projects get their staffing looked up.
 *
 * There is no aggregate endpoint, so a gap costs one `details` request per
 * project. Enriching every project would mean an unbounded fan-out to fill a
 * small panel — fifty projects, fifty requests, for five rows on screen. Home
 * shows a shortlist, so only the shortlist is enriched; the rest report
 * "Staffing not checked" rather than a number nobody paid for.
 */
export const STAFFING_ENRICHMENT_LIMIT = 5;

/** How many rows each Home section shows before linking out to its domain. */
export const SECTION_PREVIEW_LIMIT = 5;

export type HomeData = {
  readonly myProjects: Loaded<MyProjects>;
  readonly mySkills: Loaded<readonly MySkill[]>;
  readonly managedProjects: Loaded<readonly ManagedProjectWithStaffing[]> | null;
  readonly pendingProposals: Loaded<readonly PendingProposal[]> | null;
  readonly departmentProjects: Loaded<DepartmentProjects> | null;
  readonly departments: Loaded<readonly OrganizationDepartment[]> | null;
  readonly organizationUsers: Loaded<readonly OrganizationUser[]> | null;
};

export async function loadHomeData(
  roles: readonly AccessRole[],
  sources: HomeDataSources = HOME_DATA_SOURCES,
): Promise<HomeData> {
  const isProjectManager = roles.includes("PROJECT_MANAGER");
  const isDepartmentManager = roles.includes("DEPARTMENT_MANAGER");
  const isOrganizationAdmin = roles.includes("ORGANIZATION_ADMIN");

  // Independent, so they run together rather than one after another.
  const [
    myProjects,
    mySkills,
    managedProjects,
    pendingProposals,
    departmentProjects,
    departments,
    organizationUsers,
  ] = await Promise.all([
    sources.getMyProjects(),
    sources.getMySkills(),
    isProjectManager ? loadManagedProjects(sources) : Promise.resolve(null),
    isDepartmentManager ? sources.getPendingDepartmentProposals() : Promise.resolve(null),
    isDepartmentManager ? sources.getDepartmentProjects() : Promise.resolve(null),
    isOrganizationAdmin ? sources.getDepartments() : Promise.resolve(null),
    isOrganizationAdmin ? sources.getOrganizationUsers() : Promise.resolve(null),
  ]);

  return {
    myProjects,
    mySkills,
    managedProjects,
    pendingProposals,
    departmentProjects,
    departments,
    organizationUsers,
  };
}

async function loadManagedProjects(
  sources: HomeDataSources,
): Promise<Loaded<readonly ManagedProjectWithStaffing[]>> {
  const loaded = await sources.getManagedProjects();
  if (!loaded.ok) return loaded;

  // Projects that are actually running come first: a gap on a live project is
  // the one worth acting on today.
  const ordered = [...loaded.value].sort(
    (left, right) => projectAttentionRank(left.status) - projectAttentionRank(right.status),
  );

  const shortlist = ordered.slice(0, STAFFING_ENRICHMENT_LIMIT);
  const details = await Promise.all(
    shortlist.map((project) => sources.getProjectStaffingDetails(project.projectId)),
  );

  const enriched = new Map<string, number>();
  shortlist.forEach((project, index) => {
    const detail = details[index];
    // A detail that failed leaves the project unenriched rather than defaulting
    // to zero, which would read as "fully staffed".
    if (detail?.ok) enriched.set(project.projectId, openStaffingSlots(detail.value));
  });

  return {
    ok: true,
    value: ordered.map((project) => ({
      ...project,
      openStaffingSlots: enriched.get(project.projectId) ?? null,
    })),
  };
}
