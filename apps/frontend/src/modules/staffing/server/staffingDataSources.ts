import "server-only";

import { backendGet, backendPost } from "@/modules/auth/server-public";

import type {
  AssignmentProposalResult,
  StaffingProjectContext,
  TeamFinderResult,
} from "../model/teamFinderData";
import type { TeamFinderRequestBody } from "../model/teamFinderQuery";

/**
 * Every backend call staffing makes, one typed function each.
 *
 * Components never call `fetch`. Each function names the endpoint it uses, and
 * the paths are literals here rather than anything the browser could choose.
 */

/**
 * Why a read produced nothing.
 *
 * `NOT_FOUND` is deliberately ambiguous, because the backend's 404 is: a project
 * that does not exist and one this caller has no relationship to answer
 * identically, so being refused never confirms something is there.
 */
export type LoadFailure = "FORBIDDEN" | "NOT_FOUND" | "ERROR";

export type Loaded<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: LoadFailure };

function failureFor(status: number): LoadFailure {
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  return "ERROR";
}

/**
 * `GET /projects/{projectId}/details` — the relationship-aware read.
 *
 * Staffing uses it for two things at once: the project context a manager needs
 * on screen, and the manager id that decides whether they may run the finder at
 * all.
 */
export async function getProjectContext(
  projectId: string,
): Promise<Loaded<StaffingProjectContext>> {
  const outcome = await backendGet<StaffingProjectContext>(
    `/projects/${encodeURIComponent(projectId)}/details`,
  );
  if (outcome.ok) return { ok: true, value: outcome.value };
  return { ok: false, reason: failureFor(outcome.error.status) };
}

/**
 * `POST /projects/{projectId}/team-finder` — a read expressed as a POST.
 *
 * It persists nothing, creates no proposal and changes no project; it takes a
 * body because the criteria are structured. That is the backend's shape and it
 * is not reinterpreted here — no GET equivalent is invented, and no proxy lets
 * the browser reach it.
 */
export async function findCandidates(
  projectId: string,
  body: TeamFinderRequestBody,
): Promise<Loaded<TeamFinderResult>> {
  const outcome = await backendPost<TeamFinderResult>(
    `/projects/${encodeURIComponent(projectId)}/team-finder`,
    body,
  );
  if (outcome.ok) return { ok: true, value: outcome.value };
  return { ok: false, reason: failureFor(outcome.error.status) };
}

export type ProposalOutcome =
  | { readonly ok: true; readonly value: AssignmentProposalResult }
  | { readonly ok: false; readonly status: number; readonly detail: string | null };

/**
 * `POST /projects/{projectId}/assignment-proposals`.
 *
 * A proposal, not an assignment: nobody joins the project until a department
 * manager accepts it. The status and the backend's own sentence are kept here so
 * the action can turn a conflict into something worth reading, and are narrowed
 * before anything crosses to the browser.
 */
export async function proposeAssignment(
  projectId: string,
  body: {
    readonly employeeId: string;
    readonly workHoursPerDay: number;
    readonly teamRoleIds: readonly string[];
    readonly comments?: string;
  },
): Promise<ProposalOutcome> {
  const outcome = await backendPost<AssignmentProposalResult>(
    `/projects/${encodeURIComponent(projectId)}/assignment-proposals`,
    body,
  );
  if (outcome.ok) return { ok: true, value: outcome.value };
  return { ok: false, status: outcome.error.status, detail: outcome.error.detail };
}

/** The full set, so loaders and actions can be tested against fakes. */
export type StaffingDataSources = {
  readonly getProjectContext: typeof getProjectContext;
  readonly findCandidates: typeof findCandidates;
  readonly proposeAssignment: typeof proposeAssignment;
};

export const STAFFING_DATA_SOURCES: StaffingDataSources = {
  getProjectContext,
  findCandidates,
  proposeAssignment,
};
