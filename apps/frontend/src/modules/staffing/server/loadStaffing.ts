import "server-only";

import type { AccessRole } from "@/shared/types/accessRole";

import type { ManagedProjectEntry, ReviewProposal, ReviewStatus } from "../model/reviewQueue";
import {
  STAFFING_DATA_SOURCES,
  type Loaded,
  type StaffingDataSources,
} from "./staffingDataSources";

/**
 * What `/staffing` loads, per capability.
 *
 * Staffing is a handshake with two sides, and one person can be on both. So this
 * is a union rather than a mode: a department manager gets the review queue, a
 * project manager gets their own projects, and somebody who is both gets both —
 * reviews first, because that is work other people are waiting on.
 *
 * Each source is called only for the capability that entitles it. Calling the
 * review endpoint for a project manager would send a request the backend rightly
 * refuses, on every page load.
 */

export type StaffingData = {
  /** Null when this session holds no DEPARTMENT_MANAGER role at all. */
  readonly reviews: Loaded<readonly ReviewProposal[]> | null;
  /** Null when this session holds no PROJECT_MANAGER role at all. */
  readonly managedProjects: Loaded<readonly ManagedProjectEntry[]> | null;
  readonly status: ReviewStatus;
};

export async function loadStaffing(
  status: ReviewStatus,
  roles: readonly AccessRole[],
  sources: StaffingDataSources = STAFFING_DATA_SOURCES,
): Promise<StaffingData> {
  const reviewsFor = roles.includes("DEPARTMENT_MANAGER");
  const projectsFor = roles.includes("PROJECT_MANAGER");

  // Independent, so they run together rather than one after another.
  const [reviews, managedProjects] = await Promise.all([
    reviewsFor ? sources.getReviewQueue(status) : Promise.resolve(null),
    projectsFor ? sources.getManagedProjectEntries() : Promise.resolve(null),
  ]);

  return { reviews, managedProjects, status };
}

/** Whether this session has any business on `/staffing` at all. */
export function hasStaffingCapability(roles: readonly AccessRole[]): boolean {
  return roles.includes("DEPARTMENT_MANAGER") || roles.includes("PROJECT_MANAGER");
}
