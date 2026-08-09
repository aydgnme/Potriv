"use client";

import { useState } from "react";

import { Button } from "@/shared/ui/Button";
import { formatDate } from "@/shared/utils/formatDate";

import { proposalTypeLabel, type ReviewProposal, type ReviewStatus } from "../model/reviewQueue";
import { emptyQueueMessage } from "../model/staffingQuery";

import { ReviewDetail } from "./ReviewDetail";
import styles from "./Staffing.module.css";

export type ReviewQueueProps = {
  readonly proposals: readonly ReviewProposal[];
  readonly status: ReviewStatus;
};

/**
 * The queue beside the request being read.
 *
 * Backend order is kept exactly: the feed is already oldest-first with a stable
 * tie-breaker, and re-sorting by type would push a three-week-old request below
 * one from this morning. Selecting a row is a local move — the queue has already
 * been fetched, and re-reading it to look at a second request would be a request
 * nobody asked for. Changing the status filter *is* a new question, so that
 * navigates.
 */
export function ReviewQueue({ proposals, status }: ReviewQueueProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    proposals[0]?.proposalId ?? null,
  );
  // On a narrow screen the two panes take turns instead of being squeezed.
  const [showingDetail, setShowingDetail] = useState(false);

  const selected =
    proposals.find((proposal) => proposal.proposalId === selectedId) ?? proposals[0] ?? null;

  if (proposals.length === 0) {
    return <p className={styles.panelNote}>{emptyQueueMessage(status)}</p>;
  }

  return (
    <div className={styles.split} data-showing={showingDetail ? "detail" : "list"}>
      <div className={styles.listPane}>
        <ul className={styles.queue}>
          {proposals.map((proposal) => {
            const isSelected = proposal.proposalId === selected?.proposalId;

            return (
              <li key={proposal.proposalId}>
                {/* A real button: selecting a request is an action, and a
                    clickable row would be unreachable by keyboard. */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(proposal.proposalId);
                    setShowingDetail(true);
                  }}
                  aria-pressed={isSelected}
                  className={[styles.queueRow, isSelected ? styles.queueRowSelected : null]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <span className={styles.queueType}>
                    {proposalTypeLabel(proposal.proposalType)}
                    {/* Named in text as well as styled, so the selection survives
                        without colour. */}
                    {isSelected ? <span className={styles.muted}> · Selected</span> : null}
                  </span>
                  <span className={styles.queueName}>{proposal.employee.name}</span>
                  <span className={styles.queueMeta}>{proposal.project.name}</span>
                  <span className={styles.queueMeta}>
                    {[
                      proposal.workHoursPerDay === null
                        ? null
                        : `${proposal.workHoursPerDay} h/day`,
                      formatDate(proposal.createdAt),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className={styles.detailPane}>
        <div className={styles.backToList}>
          <Button variant="secondary" size="sm" onClick={() => setShowingDetail(false)}>
            Back to reviews
          </Button>
        </div>

        {selected ? (
          <ReviewDetail key={selected.proposalId} proposal={selected} />
        ) : null}
      </div>
    </div>
  );
}
