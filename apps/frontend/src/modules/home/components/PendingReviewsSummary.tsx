import type { PendingProposal } from "../model/homeData";
import type { Loaded } from "../server/homeDataSources";

import { HomeSection } from "./HomeSection";
import { SectionError } from "./SectionError";
import styles from "./Home.module.css";

export type PendingReviewsSummaryProps = {
  readonly data: Loaded<readonly PendingProposal[]>;
  readonly limit: number;
};

/**
 * Staffing requests waiting on this department manager — the one place in Potriv
 * where another person is actually blocked.
 *
 * Called "Pending staffing reviews", not Notifications or Inbox: there is no
 * notification system, and naming it one would promise something the backend
 * does not have. Home previews and links; the decision itself belongs to
 * Staffing, so there is no accept or reject here.
 */
export function PendingReviewsSummary({ data, limit }: PendingReviewsSummaryProps) {
  if (!data.ok) {
    return (
      <HomeSection title="Pending staffing reviews">
        {data.reason === "FORBIDDEN" ? (
          // Not an outage. The user holds DEPARTMENT_MANAGER but manages no
          // department, so there is genuinely nothing here to review — saying
          // "try again" would describe a failure that is not happening.
          <p className={styles.empty}>
            You are not managing a department yet, so no staffing requests come to
            you.
          </p>
        ) : (
          <SectionError>Could not load staffing reviews. Try again from Staffing.</SectionError>
        )}
      </HomeSection>
    );
  }

  const proposals = data.value.slice(0, limit);

  return (
    <HomeSection
      title="Pending staffing reviews"
      summary={summaryFor(data.value.length)}
      action={{ label: "Review", href: "/staffing" }}
    >
      {proposals.length === 0 ? (
        <p className={styles.empty}>No requests are waiting for your decision.</p>
      ) : (
        <ul className={styles.rows}>
          {proposals.map((proposal) => (
            <li key={proposal.proposalId} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.rowTitle}>
                  {proposal.employee.name} → {proposal.project.name}
                </span>
                <span className={styles.rowMeta}>
                  {proposal.proposalType === "DEALLOCATION" ? "Removal" : "Assignment"}
                  {proposal.workHoursPerDay !== null
                    ? ` · ${proposal.workHoursPerDay} h/day`
                    : ""}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </HomeSection>
  );
}

function summaryFor(count: number): string {
  // The count always travels with its noun, so it still means something read aloud.
  if (count === 0) return "Nothing waiting on you";
  return count === 1 ? "1 request needs your decision" : `${count} requests need your decision`;
}
