import type { ReviewStatus } from "./reviewQueue";

/**
 * Which slice of the review queue is on screen, expressed in the URL.
 *
 * `PENDING` is both the backend's default and the honest one: the queue exists to
 * show work waiting on a decision, and anything unrecognised in the address falls
 * back to it rather than reaching the backend.
 */

const STATUSES: readonly ReviewStatus[] = ["PENDING", "APPROVED", "REJECTED"];

export const DEFAULT_REVIEW_STATUS: ReviewStatus = "PENDING";

export type RawSearchParams = Readonly<Record<string, string | readonly string[] | undefined>>;

export function normalizeReviewStatus(params: RawSearchParams): ReviewStatus {
  const raw = Array.isArray(params.status) ? params.status[0] : (params.status as string | undefined);

  // Exact match only. "pending" is not the enum, and neither is anything else.
  return STATUSES.find((status) => status === raw) ?? DEFAULT_REVIEW_STATUS;
}

export const REVIEW_STATUS_TABS: readonly { readonly status: ReviewStatus; readonly label: string }[] = [
  { status: "PENDING", label: "Waiting" },
  { status: "APPROVED", label: "Approved" },
  { status: "REJECTED", label: "Rejected" },
];

export function staffingHref(status: ReviewStatus): string {
  return status === DEFAULT_REVIEW_STATUS ? "/staffing" : `/staffing?status=${status}`;
}

/** The empty state each filter deserves. "No data" says nothing. */
export function emptyQueueMessage(status: ReviewStatus): string {
  if (status === "APPROVED") return "No approved proposals.";
  if (status === "REJECTED") return "No rejected proposals.";
  // Good news, and worded as such.
  return "No proposals waiting.";
}
