import type { ProjectStatus } from "@/shared/types/projectStatus";

import type { DepartmentSummary, UserSummary } from "./teamFinderData";

/**
 * The department manager's review queue: one merged feed of both proposal types.
 *
 * The backend returns assignment and removal requests together, oldest first with
 * a stable tie-breaker, so the frontend makes exactly one list call and preserves
 * that order. Splitting it into two calls, or re-sorting by type, would put a
 * three-week-old request below one from this morning.
 */

export type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";

export type ProposalType = "ASSIGNMENT" | "DEALLOCATION";

/**
 * One queue item.
 *
 * Type decides which fields carry anything: an assignment has the manager's
 * `comments` and no `allocationId` or `reason`; a removal has an `allocationId`
 * and the manager's required `reason`, and no `comments`. Nulls are rendered as
 * absence, never as an empty value of the other type's field.
 */
export type ReviewProposal = {
  readonly proposalType: ProposalType;
  readonly proposalId: string;
  readonly project: {
    readonly projectId: string;
    readonly name: string;
    readonly status: ProjectStatus;
  };
  readonly employee: UserSummary;
  readonly reviewDepartment: DepartmentSummary | null;
  readonly workHoursPerDay: number | null;
  readonly teamRoles: readonly { readonly teamRoleId: string; readonly name: string }[];
  /** Assignment only: what the project manager said when asking. */
  readonly comments: string | null;
  /** Removal only. */
  readonly allocationId: string | null;
  /** Removal only: why the project manager asked to end the allocation. */
  readonly reason: string | null;
  readonly status: ReviewStatus;
  readonly proposedBy: UserSummary | null;
  readonly createdAt: string | null;
  readonly reviewedBy: UserSummary | null;
  readonly reviewedAt: string | null;
  /**
   * Present on **pending assignment rows only**. A removal frees capacity rather
   * than consuming it, and a decided row has nothing left to check, so both carry
   * null — which is rendered as no capacity block, never as zeros.
   */
  readonly capacity: CapacityContext | null;
  /**
   * Why the **reviewer** declined. A different statement by a different person
   * from `reason`, and the two are never merged.
   */
  readonly rejectionReason: string | null;
};

/**
 * What the reviewer is told about the employee's day, computed by the backend
 * with the same rule acceptance uses.
 *
 * `maxHoursPerDay` is published precisely so no client has to hard-code it, and
 * `currentlyAcceptableByCapacity` is the backend's own conclusion — recomputing
 * either from the numbers would be a second, quieter capacity model.
 *
 * It is current state, not a reservation. Nothing is held back for this proposal.
 */
export type CapacityContext = {
  readonly maxHoursPerDay: number;
  readonly allocatedHoursPerDay: number;
  readonly availableHoursPerDay: number;
  readonly requestedHoursPerDay: number;
  readonly projectedAllocatedHoursPerDay: number;
  readonly projectedAvailableHoursPerDay: number;
  readonly currentlyAcceptableByCapacity: boolean;
};

/** `GET /projects/managed` — the project manager's own staffing entry points. */
export type ManagedProjectEntry = {
  readonly projectId: string;
  readonly name: string;
  readonly status: ProjectStatus;
};

/** What a review or removal call reports back, narrowed to what the UI says. */
export type ReviewOutcome = {
  readonly proposalId: string;
  readonly status: ReviewStatus;
  readonly projectId: string | null;
  /** Set once a removal is accepted; the allocation has genuinely ended. */
  readonly deallocatedAt: string | null;
};

/** `POST /projects/{id}/allocations/{id}/deallocation-proposals` */
export type DeallocationProposalResult = {
  readonly proposalId: string;
  readonly reviewDepartment: DepartmentSummary | null;
  readonly status: ReviewStatus;
};

/** Human wording. Enum names never lead. */
export function proposalTypeLabel(type: ProposalType): string {
  return type === "ASSIGNMENT" ? "Assignment request" : "Removal request";
}
