"use client";

import { useActionState, useRef, useState } from "react";

import { Button } from "@/shared/ui/Button";
import { FormErrorSummary } from "@/shared/ui/FormErrorSummary";

import { EMPTY_REMOVAL_STATE } from "../model/reviewActionState";
import { proposeDeallocationAction } from "../server/actions/removalActions";

import styles from "./Staffing.module.css";

export type ProposeRemovalActionProps = {
  readonly projectId: string;
  readonly allocationId: string;
  readonly employeeName: string;
};

const REASON_MAX = 5000;

/**
 * Asking for someone to come off a project.
 *
 * **This removes nobody.** It creates a request their department manager
 * reviews, and the person stays on the project until that decision is made — so
 * the action is "Propose removal", never "Remove now", and success says the
 * request was sent rather than that anything ended.
 *
 * The reason is required because, if the removal is approved, it is stored
 * permanently with the past allocation and becomes the only record of why.
 */
export function ProposeRemovalAction({
  projectId,
  allocationId,
  employeeName,
}: ProposeRemovalActionProps) {
  const [state, formAction, isPending] = useActionState(
    proposeDeallocationAction,
    EMPTY_REMOVAL_STATE,
  );
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");

  const reasonId = `removal-reason-${allocationId}`;
  const tooLong = reason.trim().length > REASON_MAX;

  if (state.sentTo) {
    return (
      <span className={styles.muted}>
        {`Removal proposal sent to ${state.sentTo} for review.`}
      </span>
    );
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => dialogRef.current?.showModal()}
        loading={isPending}
      >
        Propose removal
      </Button>

      <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={`${reasonId}-title`}>
        <h2 id={`${reasonId}-title`} className={styles.panelHeading}>
          {`Propose removing ${employeeName}?`}
        </h2>

        <p className={styles.panelNote}>
          This does not remove the person immediately. Their department manager must review
          the request. If approved, the reason is stored permanently with the past allocation.
        </p>

        {/* The character counter below is a typing-time hint that changes on
            every keystroke; it stays out of here so it cannot chatter. Only the
            action's own field error is announced. */}
        <FormErrorSummary
        submission={state}
          formError={state.formError}
          title={state.formError ? "This was not sent" : undefined}
          fieldErrors={state.fieldErrors}
          labels={{ reason: "Reason" }}
        />

        <form action={formAction} className={styles.removalForm}>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="allocationId" value={allocationId} />

          <label className={styles.fieldLabel} htmlFor={reasonId}>
            Reason
            <span className={styles.muted}> · Required</span>
          </label>
          <textarea
            id={reasonId}
            name="reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={REASON_MAX}
            rows={4}
            className={[styles.control, styles.textarea].join(" ")}
            aria-invalid={state.fieldErrors.reason || tooLong ? true : undefined}
            aria-describedby={`${reasonId}-help`}
          />
          <span
            id={`${reasonId}-help`}
            className={state.fieldErrors.reason || tooLong ? styles.fieldError : styles.panelNote}
          >
            {state.fieldErrors.reason ??
              (tooLong
                ? `Use at most ${REASON_MAX} characters.`
                : "Why this person should come off the project.")}
          </span>

          <div className={styles.dialogActions}>
            <Button variant="secondary" onClick={() => dialogRef.current?.close()}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={isPending}
              disabled={reason.trim().length === 0 || tooLong}
              onClick={() => dialogRef.current?.close()}
            >
              Propose removal
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
