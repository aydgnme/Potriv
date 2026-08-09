import "server-only";

import { backendGet, backendPost } from "@/modules/auth/server-public";

import type {
  DeallocationProposalResult,
  ManagedProjectEntry,
  ReviewProposal,
  ReviewStatus,
} from "../model/reviewQueue";
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

/** One authenticated GET, classified. The path is always a literal from this file. */
async function load<T>(path: string): Promise<Loaded<T>> {
  const outcome = await backendGet<T>(path);
  if (outcome.ok) return { ok: true, value: outcome.value };
  return { ok: false, reason: failureFor(outcome.error.status) };
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

/**
 * `GET /projects/{projectId}/team` — the current team, for checking an allocation
 * is genuinely active before a removal is proposed for it.
 *
 * Only the active list is read here; proposed and past members are somebody
 * else's screen.
 */
export function getProjectTeamMembers(
  projectId: string,
): Promise<Loaded<{ readonly activeMembers: readonly { readonly allocationId: string }[] }>> {
  return load<{ readonly activeMembers: readonly { readonly allocationId: string }[] }>(
    `/projects/${encodeURIComponent(projectId)}/team`,
  );
}

/**
 * `GET /department/project-proposals?status=` — the review queue.
 *
 * One call, one merged feed. The backend already interleaves assignment and
 * removal requests oldest-first with a stable tie-breaker, so two calls would
 * only produce two lists nobody asked for and an order somebody would have to
 * invent.
 *
 * `FORBIDDEN` here is not an outage: holding DEPARTMENT_MANAGER without an actual
 * department assignment is refused, and that is a setup state worth naming.
 */
export function getReviewQueue(
  status: ReviewStatus,
): Promise<Loaded<readonly ReviewProposal[]>> {
  return load<readonly ReviewProposal[]>(
    `/department/project-proposals?status=${encodeURIComponent(status)}`,
  );
}

/**
 * `GET /projects/managed` — the project manager's own projects.
 *
 * The backend has no PM-wide proposal list, so this is the honest staffing entry
 * point: the projects they manage, each linking to Team Finder and the team.
 * Fanning out `/team` across all of them to simulate an inbox would be inventing
 * a feature out of N requests.
 */
export function getManagedProjectEntries(): Promise<Loaded<readonly ManagedProjectEntry[]>> {
  return load<readonly ManagedProjectEntry[]>("/projects/managed");
}

export type MutationOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly status: number; readonly detail: string | null };

async function mutate<T>(path: string, body?: unknown): Promise<MutationOutcome<T>> {
  const outcome = await backendPost<T>(path, body ?? {});
  if (outcome.ok) return { ok: true, value: outcome.value };
  return { ok: false, status: outcome.error.status, detail: outcome.error.detail };
}

/** `POST /department/project-proposals/assignments/{proposalId}/accept` — no body. */
export function acceptAssignment<T>(proposalId: string): Promise<MutationOutcome<T>> {
  return mutate<T>(
    `/department/project-proposals/assignments/${encodeURIComponent(proposalId)}/accept`,
  );
}

/** `POST …/assignments/{proposalId}/reject` — the reason is genuinely optional. */
export function rejectAssignment<T>(
  proposalId: string,
  reason: string | null,
): Promise<MutationOutcome<T>> {
  return mutate<T>(
    `/department/project-proposals/assignments/${encodeURIComponent(proposalId)}/reject`,
    reason === null ? {} : { reason },
  );
}

/** `POST /department/project-proposals/deallocations/{proposalId}/accept`. */
export function acceptDeallocation<T>(proposalId: string): Promise<MutationOutcome<T>> {
  return mutate<T>(
    `/department/project-proposals/deallocations/${encodeURIComponent(proposalId)}/accept`,
  );
}

/** `POST …/deallocations/{proposalId}/reject`. */
export function rejectDeallocation<T>(
  proposalId: string,
  reason: string | null,
): Promise<MutationOutcome<T>> {
  return mutate<T>(
    `/department/project-proposals/deallocations/${encodeURIComponent(proposalId)}/reject`,
    reason === null ? {} : { reason },
  );
}

/**
 * `POST /projects/{projectId}/allocations/{allocationId}/deallocation-proposals`.
 *
 * Asks for someone to come off a project. Nobody moves until a department
 * manager accepts, and the reason is stored with the past allocation if they do.
 */
export function proposeDeallocation(
  projectId: string,
  allocationId: string,
  reason: string,
): Promise<MutationOutcome<DeallocationProposalResult>> {
  return mutate<DeallocationProposalResult>(
    `/projects/${encodeURIComponent(projectId)}/allocations/${encodeURIComponent(allocationId)}/deallocation-proposals`,
    { reason },
  );
}

/** The full set, so loaders and actions can be tested against fakes. */
export type StaffingDataSources = {
  readonly getProjectContext: typeof getProjectContext;
  readonly findCandidates: typeof findCandidates;
  readonly proposeAssignment: typeof proposeAssignment;
  readonly getReviewQueue: typeof getReviewQueue;
  readonly getManagedProjectEntries: typeof getManagedProjectEntries;
  readonly getProjectTeamMembers: typeof getProjectTeamMembers;
};

export const STAFFING_DATA_SOURCES: StaffingDataSources = {
  getProjectContext,
  findCandidates,
  proposeAssignment,
  getReviewQueue,
  getManagedProjectEntries,
  getProjectTeamMembers,
};
