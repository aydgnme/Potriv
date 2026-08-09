import "server-only";

import type { AccessRole } from "@/shared/types/accessRole";

import type { StaffingProjectContext, TeamFinderResult } from "../model/teamFinderData";
import type { TeamFinderCriteriaInput } from "../model/teamFinderQuery";
import { toRequestBody } from "../model/teamFinderQuery";
import {
  STAFFING_DATA_SOURCES,
  type Loaded,
  type LoadFailure,
  type StaffingDataSources,
} from "./staffingDataSources";

/**
 * What the Team Finder route loads, and — as importantly — when it declines to.
 *
 * The order matters. The project is read first through the relationship-aware
 * endpoint, so an unrelated caller is refused by the backend before this module
 * forms any opinion. Only then is ownership checked, and only then does the
 * finder run.
 */

export type TeamFinderState =
  /** The project could not be read: missing, or no relationship to it. */
  | { readonly kind: "unavailable"; readonly reason: LoadFailure }
  /** Readable, but this session may not staff it. */
  | { readonly kind: "not-owner"; readonly project: StaffingProjectContext }
  /** Nothing to match on: the project declares no technologies. */
  | { readonly kind: "no-technologies"; readonly project: StaffingProjectContext }
  | {
      readonly kind: "ready";
      readonly project: StaffingProjectContext;
      readonly result: Loaded<TeamFinderResult>;
    };

/**
 * Whether this session may staff this project.
 *
 * Holding `PROJECT_MANAGER` says someone can manage projects; it does not say
 * they manage *this* one. A manager who can read another manager's project — as
 * a member, say — is a reader here and nothing more.
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

export async function loadTeamFinder(
  projectId: string,
  criteria: TeamFinderCriteriaInput,
  session: { readonly userId: string; readonly roles: readonly AccessRole[] },
  sources: StaffingDataSources = STAFFING_DATA_SOURCES,
): Promise<TeamFinderState> {
  const project = await sources.getProjectContext(projectId);
  if (!project.ok) return { kind: "unavailable", reason: project.reason };

  if (!ownsProject(session.roles, session.userId, project.value.projectManager?.userId)) {
    // A reader, not a staffer. The finder is never called on their behalf — the
    // backend would refuse it, and asking anyway would make capability depend on
    // error handling.
    return { kind: "not-owner", project: project.value };
  }

  if (project.value.technologyStack.length === 0) {
    // Matching is exact-normalized between the project's technologies and
    // people's skills. With no technologies declared there is nothing to match
    // on, so the request is skipped rather than sent to come back empty.
    return { kind: "no-technologies", project: project.value };
  }

  // Declaring no role requirements is not a blocker: skills still match from
  // technologies. It only means past-project similarity has no target roles to
  // compare against, so that component stays 0.
  const result = await sources.findCandidates(projectId, toRequestBody(criteria));

  return { kind: "ready", project: project.value, result };
}
