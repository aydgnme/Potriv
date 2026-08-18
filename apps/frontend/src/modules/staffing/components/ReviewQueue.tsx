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
        {/*
          A native table: these are comparable requests with real columns, and a
          department manager scans them to find the one to open. At narrower
          widths the same markup becomes labelled stacked records, so the
          semantics never change with the layout.

          The row is not the click target — a bare `<tr>` with a handler is
          unreachable by keyboard — so the button lives in the row header cell
          and every other cell is data.
        */}
        <table className={styles.queueTable}>
          <caption className="p-visually-hidden">
            {`Staffing requests, oldest first. ${proposals.length} shown.`}
          </caption>
          <thead>
            <tr>
              <th scope="col">Request</th>
              <th scope="col">Employee</th>
              <th scope="col">Project</th>
              <th scope="col">Commitment</th>
              <th scope="col">Requested</th>
            </tr>
          </thead>
          <tbody>
            {proposals.map((proposal) => {
              const isSelected = proposal.proposalId === selected?.proposalId;

              return (
                <tr
                  key={proposal.proposalId}
                  className={isSelected ? styles.queueRowSelected : undefined}
                >
                  <th scope="row" className={styles.queueCell}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(proposal.proposalId);
                        setShowingDetail(true);
                      }}
                      aria-pressed={isSelected}
                      className={styles.queueButton}
                    >
                      {/* Human wording, never the enum. Both are ordinary
                          requests, so neither gets a success or danger colour. */}
                      {proposalTypeLabel(proposal.proposalType)}
                      {/*
                        Who and what this request is about, for anyone who hears
                        the button rather than seeing the row. Without it a queue
                        of five reads as five identical "Assignment request"
                        buttons — the columns beside it are what disambiguate
                        them on screen, and a screen reader is not in the row.
                      */}
                      <span className="p-visually-hidden">
                        {` — ${proposal.employee.name}, ${proposal.project.name}`}
                      </span>
                      {/* Named in text as well as styled, so the selection
                          survives without colour. */}
                      {isSelected ? <span className={styles.muted}> · Selected</span> : null}
                    </button>
                  </th>
                  <td data-label="Employee" className={styles.queueName}>
                    {proposal.employee.name}
                  </td>
                  <td data-label="Project" className={styles.queueMeta}>
                    {proposal.project.name}
                  </td>
                  <td data-label="Commitment" className={styles.queueMeta}>
                    {/* Null on a removal: ending an allocation commits no hours,
                        and 0 would read as a real figure. */}
                    {proposal.workHoursPerDay === null
                      ? "—"
                      : `${proposal.workHoursPerDay} h/day`}
                  </td>
                  <td data-label="Requested" className={styles.queueMeta}>
                    {formatDate(proposal.createdAt) ?? "Not recorded"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
