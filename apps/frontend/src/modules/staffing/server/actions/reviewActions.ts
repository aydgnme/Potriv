"use server";

import { revalidatePath } from "next/cache";

import { resolveProductSession } from "@/modules/auth/server/productSession";

import type { ReviewActionState } from "../../model/reviewActionState";
import type { ReviewOutcome } from "../../model/reviewQueue";
import {
  acceptAssignment,
  acceptDeallocation,
  rejectAssignment,
  rejectDeallocation,
  type MutationOutcome,
} from "../staffingDataSources";

/**
 * A department manager's decisions.
 *
 * Each action names one fixed backend path — the browser supplies a proposal id
 * and nothing else — and the backend stays authoritative for everything that
 * matters: whether this person actually manages the reviewing department, whether
 * the proposal is still pending, whether capacity still fits, and what state the
 * allocation is in.
 *
 * What comes back is one sentence. No status code, no path, no envelope.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REASON_MAX = 5000;

const FALLBACK = {
  FORBIDDEN: "You do not have permission to review staffing requests.",
  NOT_FOUND: "This request is no longer available.",
  CONFLICT: "This request could not be completed as it stands.",
  VALIDATION: "That could not be accepted. Check the details and try again.",
  UNAUTHENTICATED: "Your session has expired. Sign in again to continue.",
  SERVER: "Something went wrong. Try again.",
} as const;

function messageFor(status: number, detail: string | null): string {
  if (detail !== null) return detail;
  if (status === 400 || status === 422) return FALLBACK.VALIDATION;
  if (status === 401) return FALLBACK.UNAUTHENTICATED;
  if (status === 403) return FALLBACK.FORBIDDEN;
  if (status === 404) return FALLBACK.NOT_FOUND;
  if (status === 409) return FALLBACK.CONFLICT;
  return FALLBACK.SERVER;
}

/**
 * Whether a conflict means somebody else already decided this.
 *
 * That one is different from the others: the row on screen is not merely
 * refused, it is out of date, and leaving its buttons live would invite a second
 * decision on something already settled.
 */
function isAlreadyReviewed(status: number, detail: string | null): boolean {
  return status === 409 && detail !== null && /already been reviewed/i.test(detail);
}

async function requireDepartmentManager(): Promise<boolean> {
  const session = await resolveProductSession();
  return session.authenticated && session.user.roles.includes("DEPARTMENT_MANAGER");
}

function readProposalId(formData: FormData): string | null {
  const value = formData.get("proposalId");
  return typeof value === "string" && UUID.test(value) ? value : null;
}

/**
 * The reviewer's reason, or nothing.
 *
 * Rejecting without explaining stays valid — the backend treats blank and absent
 * identically, so "no reason given" has exactly one representation.
 */
function readReason(formData: FormData): { reason: string | null } | { error: string } {
  const raw = formData.get("reason");
  if (typeof raw !== "string") return { reason: null };

  const trimmed = raw.trim();
  if (trimmed.length > REASON_MAX) {
    return { error: `Use at most ${REASON_MAX} characters.` };
  }
  return { reason: trimmed.length === 0 ? null : trimmed };
}

/**
 * Refresh what the decision actually changed.
 *
 * The queue and Home's waiting-reviews summary always move. The project surfaces
 * move too when the response says which project — an approved assignment adds
 * someone to the team and closes a staffing gap; an approved removal does the
 * reverse. Unrelated paths are left alone.
 */
function revalidateAfterReview(outcome: ReviewOutcome | null): void {
  revalidatePath("/staffing");
  revalidatePath("/home");

  if (outcome?.projectId) {
    revalidatePath("/projects");
    revalidatePath(`/projects/${outcome.projectId}`);
    revalidatePath(`/projects/${outcome.projectId}/team`);
  }
}

type ReviewResponse = {
  readonly proposal?: {
    readonly proposalId?: string;
    readonly status?: string;
    readonly project?: { readonly projectId?: string };
  };
  readonly allocation?: { readonly deallocatedAt?: string | null };
};

function outcomeOf(response: ReviewResponse): ReviewOutcome {
  return {
    proposalId: response.proposal?.proposalId ?? "",
    status: (response.proposal?.status as ReviewOutcome["status"]) ?? "PENDING",
    projectId: response.proposal?.project?.projectId ?? null,
    deallocatedAt: response.allocation?.deallocatedAt ?? null,
  };
}

async function runReview(
  formData: FormData,
  call: (proposalId: string) => Promise<MutationOutcome<ReviewResponse>>,
  done: string,
): Promise<ReviewActionState> {
  if (!(await requireDepartmentManager())) return { error: FALLBACK.FORBIDDEN };

  const proposalId = readProposalId(formData);
  if (proposalId === null) return { error: FALLBACK.NOT_FOUND };

  const outcome = await call(proposalId);
  if (!outcome.ok) {
    // Even a refusal moves the queue on: capacity may have changed, or somebody
    // else may have decided this. Re-reading is how the screen stops lying.
    revalidatePath("/staffing");
    return {
      error: messageFor(outcome.status, outcome.detail),
      stale: isAlreadyReviewed(outcome.status, outcome.detail),
    };
  }

  revalidateAfterReview(outcomeOf(outcome.value));
  return { done };
}

// ------------------------------------------------------------------ assignment

export async function acceptAssignmentProposalAction(
  _previous: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  return runReview(
    formData,
    (proposalId) => acceptAssignment<ReviewResponse>(proposalId),
    "Assignment approved. The employee is now on the project.",
  );
}

export async function rejectAssignmentProposalAction(
  _previous: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const reason = readReason(formData);
  if ("error" in reason) return { error: reason.error };

  return runReview(
    formData,
    (proposalId) => rejectAssignment<ReviewResponse>(proposalId, reason.reason),
    "Assignment request rejected.",
  );
}

// ---------------------------------------------------------------- deallocation

export async function acceptDeallocationProposalAction(
  _previous: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  return runReview(
    formData,
    (proposalId) => acceptDeallocation<ReviewResponse>(proposalId),
    "Removal approved. The allocation has ended.",
  );
}

export async function rejectDeallocationProposalAction(
  _previous: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const reason = readReason(formData);
  if ("error" in reason) return { error: reason.error };

  return runReview(
    formData,
    (proposalId) => rejectDeallocation<ReviewResponse>(proposalId, reason.reason),
    // Said plainly: rejecting a removal leaves the person where they are.
    "Removal request rejected. The employee stays on the project.",
  );
}
