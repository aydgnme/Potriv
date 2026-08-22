"use client";

import { useActionState } from "react";

import { ActionFeedback } from "@/shared/ui/ActionFeedback";
import { Button } from "@/shared/ui/Button";
import { formatDateTime } from "@/shared/utils/formatDate";

import { EMPTY_SESSION_STATE } from "../model/accountActionState";
import { isRevoked, type AccountSession } from "../model/sessionList";
import { revokeSessionAction } from "../server/actions/sessionActions";

import styles from "./Account.module.css";

export type SessionTableProps = {
  readonly sessions: readonly AccountSession[];
  readonly heading: string;
  readonly headingId: string;
  readonly caption: string;
  readonly emptyNote?: string;
};

/**
 * Sessions as a table of exactly the fields the backend returns.
 *
 * The column set is the DTO: created, last seen, user agent, IP. Nothing is
 * derived from them — no city from the IP, no device name from the user agent,
 * no "active now" from `lastSeenAt`. Every one of those would be a guess, and
 * this is the screen where somebody decides whether a session is theirs.
 *
 * Backend order (`createdAt DESC`) is preserved; the current/other split is
 * presentation over the same list, not a re-sort.
 */
export function SessionTable({
  sessions,
  heading,
  headingId,
  caption,
  emptyNote,
}: SessionTableProps) {
  return (
    <div className={styles.sessionGroup}>
      <h3 className={styles.groupHeading} id={headingId}>
        {heading}
      </h3>

      {sessions.length === 0 ? (
        <p className={styles.sectionNote}>{emptyNote ?? "None."}</p>
      ) : (
        <table className={styles.table} aria-labelledby={headingId}>
          <caption className="p-visually-hidden">{caption}</caption>
          <thead>
            <tr>
              <th scope="col">Session</th>
              <th scope="col">Created</th>
              <th scope="col">Last seen</th>
              <th scope="col">User agent</th>
              <th scope="col">IP address</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <SessionRow key={session.sessionId} session={session} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SessionRow({ session }: { readonly session: AccountSession }) {
  const [state, formAction, isPending] = useActionState(
    revokeSessionAction,
    EMPTY_SESSION_STATE,
  );
  const revoked = isRevoked(session);

  return (
    <tr>
      <th scope="row" className={styles.sessionCell}>
        {/* Said in words, not shown by highlight alone — and taken from the
            backend's own `currentSession`, never guessed from a cookie. */}
        {session.currentSession ? (
          <span className={styles.currentMark}>Current session</span>
        ) : (
          <span className={styles.muted}>Other session</span>
        )}
        {revoked ? (
          <span className={styles.endedMark}>
            {`Ended ${formatDateTime(session.revokedAt) ?? "at an unrecorded time"}`}
          </span>
        ) : null}
        {/* `span`, because this sits inside a `<th>` beside inline marks — the
            row's semantics are not disturbed, only the missing role added. */}
        <ActionFeedback
          outcome={state}
          revision={state}
          as="span"
          errorClassName={styles.fieldError}
          doneClassName={styles.sectionNote}
        />
      </th>

      <td data-label="Created" className={styles.muted}>
        {formatDateTime(session.createdAt) ?? "Not recorded"}
      </td>
      <td data-label="Last seen" className={styles.muted}>
        {/* The timestamp itself. "Active now" would be an inference the contract
            does not support. */}
        {formatDateTime(session.lastSeenAt) ?? "Not recorded"}
      </td>
      <td data-label="User agent" className={styles.agentCell}>
        {/* Shown whole and allowed to wrap. Parsing it into a device name would
            need a library and would still be a guess. */}
        {session.userAgent?.trim() || "Not recorded"}
      </td>
      <td data-label="IP address" className={styles.wrapAnywhere}>
        {session.ipAddress?.trim() || "Not recorded"}
      </td>
      <td data-label="Action">
        {revoked ? (
          <span className={styles.muted}>Already ended</span>
        ) : session.currentSession ? (
          /* Deliberately not a revoke control. Ending this session from here
             would revoke it at the backend while leaving this browser holding
             cookies that could silently restore it — so the current row uses the
             real sign-out flow instead, which clears them. */
          <span className={styles.muted}>Use Sign out</span>
        ) : (
          <form action={formAction}>
            <input type="hidden" name="sessionId" value={session.sessionId} />
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              loading={isPending}
              /* Begins with the visible label so the two agree (WCAG 2.5.3),
                 then adds the detail that tells one session from another. */
              aria-label={`Revoke session last seen ${
                formatDateTime(session.lastSeenAt) ?? "at an unrecorded time"
              }`}
            >
              Revoke session
            </Button>
          </form>
        )}
      </td>
    </tr>
  );
}
