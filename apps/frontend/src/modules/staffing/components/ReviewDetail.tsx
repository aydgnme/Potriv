"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { formatDate } from "@/shared/utils/formatDate";
import { projectStatusLabel, projectStatusTone } from "@/shared/utils/projectStatus";

import { EMPTY_REVIEW_STATE } from "../model/reviewActionState";
import { proposalTypeLabel, type ReviewProposal } from "../model/reviewQueue";
import {
  acceptAssignmentProposalAction,
  acceptDeallocationProposalAction,
  rejectAssignmentProposalAction,
  rejectDeallocationProposalAction,
} from "../server/actions/reviewActions";

import { CapacityBlock } from "./CapacityBlock";
import { RejectDialog } from "./RejectDialog";
import styles from "./Staffing.module.css";

export type ReviewDetailProps = {
  readonly proposal: ReviewProposal;
};

/**
 * One staffing request, in enough detail to decide on it.
 *
 * The two request types share a shape but not their meaning, so nothing crosses
 * between them: an assignment shows the manager's comments and — while pending —
 * the capacity context; a removal shows the manager's reason and no capacity at
 * all, because ending an allocation frees hours rather than consuming them.
 *
 * A decided request is read-only. The backend exposes no way to undo a decision,
 * so offering one would be a button that cannot work.
 */
export function ReviewDetail({ proposal }: ReviewDetailProps) {
  const isAssignment = proposal.proposalType === "ASSIGNMENT";
  const isPending = proposal.status === "PENDING";

  const [acceptState, acceptAction, accepting] = useActionState(
    isAssignment ? acceptAssignmentProposalAction : acceptDeallocationProposalAction,
    EMPTY_REVIEW_STATE,
  );
  const [rejectState, rejectAction, rejecting] = useActionState(
    isAssignment ? rejectAssignmentProposalAction : rejectDeallocationProposalAction,
    EMPTY_REVIEW_STATE,
  );

  const busy = accepting || rejecting;
  const state = acceptState.error || acceptState.done ? acceptState : rejectState;
  // Somebody else decided this while it was on screen. The queue has been
  // re-read; leaving the buttons live would invite a second decision.
  const settledElsewhere = Boolean(acceptState.stale || rejectState.stale);

  const capacityBlocks =
    isPending && proposal.capacity !== null && !proposal.capacity.currentlyAcceptableByCapacity;

  const rejectFormId = `reject-${proposal.proposalId}`;

  return (
    <div className={styles.detail}>
      <header className={styles.detailHeader}>
        <p className={styles.detailType}>{proposalTypeLabel(proposal.proposalType)}</p>
        <h2 className={styles.detailName}>{proposal.employee.name}</h2>
        <p className={styles.panelNote}>
          {proposal.reviewDepartment?.name ?? "No review department recorded"}
        </p>
      </header>

      {state.error ? (
        <Alert tone={settledElsewhere ? "warning" : "danger"} title="Not completed">
          {state.error}
        </Alert>
      ) : null}
      {state.done ? <Alert tone="success">{state.done}</Alert> : null}

      <section className={styles.panel} aria-labelledby="review-request">
        <h3 className={styles.panelHeading} id="review-request">
          Request
        </h3>
        <dl className={styles.figures}>
          <div className={styles.figureRow}>
            <dt>Project</dt>
            <dd>
              {/* A department manager involved in this project can open it; the
                  backend decides that, and a 404 there stays anti-leak. */}
              <Link href={`/projects/${proposal.project.projectId}`}>
                {proposal.project.name}
              </Link>
            </dd>
          </div>
          <div className={styles.figureRow}>
            <dt>Project status</dt>
            <dd>
              <StatusBadge
                label={projectStatusLabel(proposal.project.status)}
                tone={projectStatusTone(proposal.project.status)}
              />
            </dd>
          </div>
          {proposal.workHoursPerDay === null ? null : (
            <div className={styles.figureRow}>
              <dt>Hours per day</dt>
              <dd>{proposal.workHoursPerDay}</dd>
            </div>
          )}
          <div className={styles.figureRow}>
            <dt>Roles</dt>
            <dd>
              {proposal.teamRoles.length > 0
                ? proposal.teamRoles.map((role) => role.name).join(", ")
                : "No roles recorded"}
            </dd>
          </div>
          <div className={styles.figureRow}>
            <dt>Requested by</dt>
            <dd>
              {[proposal.proposedBy?.name, formatDate(proposal.createdAt)]
                .filter(Boolean)
                .join(" · ") || "Not recorded"}
            </dd>
          </div>
        </dl>

        {isAssignment ? (
          <>
            <h4 className={styles.groupHeading}>Comments</h4>
            <p>{proposal.comments?.trim() || "No comments."}</p>
          </>
        ) : (
          <>
            {/* The manager's own words, shown in full — this is the record of why
                somebody was asked to leave a project. */}
            <h4 className={styles.groupHeading}>Removal reason</h4>
            <p>{proposal.reason?.trim() || "No reason recorded."}</p>
          </>
        )}
      </section>

      {/* Present on pending assignments only. A removal frees capacity, and a
          decided row has nothing left to check — both carry null, and null means
          no block rather than zeros. */}
      {isPending && proposal.capacity !== null ? (
        <CapacityBlock capacity={proposal.capacity} />
      ) : null}

      {proposal.status !== "PENDING" ? (
        <section className={styles.panel} aria-labelledby="review-decision">
          <h3 className={styles.panelHeading} id="review-decision">
            Decision
          </h3>
          <dl className={styles.figures}>
            <div className={styles.figureRow}>
              <dt>Outcome</dt>
              <dd>{proposal.status === "APPROVED" ? "Approved" : "Rejected"}</dd>
            </div>
            <div className={styles.figureRow}>
              <dt>Reviewed by</dt>
              <dd>
                {[proposal.reviewedBy?.name, formatDate(proposal.reviewedAt)]
                  .filter(Boolean)
                  .join(" · ") || "Not recorded"}
              </dd>
            </div>
          </dl>
          {proposal.status === "REJECTED" ? (
            <>
              {/* A different statement by a different person from the removal
                  reason above, and never merged with it. */}
              <h4 className={styles.groupHeading}>Review rejection reason</h4>
              <p>{proposal.rejectionReason?.trim() || "No reason given"}</p>
            </>
          ) : null}
        </section>
      ) : null}

      {isPending && !settledElsewhere ? (
        <div className={styles.decisionBar}>
          <form action={acceptAction}>
            <input type="hidden" name="proposalId" value={proposal.proposalId} />
            <Button
              type="submit"
              variant="primary"
              loading={accepting}
              // Capacity is the backend's conclusion, not ours; when it says this
              // no longer fits, accepting is off and rejecting stays available.
              disabled={busy || capacityBlocks}
            >
              Accept
            </Button>
          </form>

          <form action={rejectAction} id={rejectFormId}>
            <input type="hidden" name="proposalId" value={proposal.proposalId} />
          </form>
          <RejectDialog
            proposalType={proposal.proposalType}
            proposalId={proposal.proposalId}
            disabled={busy}
            formId={rejectFormId}
          />
        </div>
      ) : null}
    </div>
  );
}
