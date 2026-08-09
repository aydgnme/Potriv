"use client";

import { useRef, useState } from "react";

import { Button } from "@/shared/ui/Button";

import type { ProposalType } from "../model/reviewQueue";

import styles from "./Staffing.module.css";

export type RejectDialogProps = {
  readonly proposalType: ProposalType;
  readonly proposalId: string;
  readonly disabled: boolean;
  /** Submits the surrounding form once a reason has been chosen, or not. */
  readonly formId: string;
};

const REASON_MAX = 5000;

/**
 * Declining a request, with an optional word about why.
 *
 * The reason really is optional — the backend treats blank and absent
 * identically — so the dialog never blocks on it and never implies it is
 * required. Rejecting a staffing request is an ordinary decision, so it is not
 * styled as a destructive one.
 *
 * A native `<dialog>` gives the focus trap and Escape for free, which is exactly
 * the behaviour that would otherwise have to be rebuilt badly.
 */
export function RejectDialog({ proposalType, proposalId, disabled, formId }: RejectDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");

  const title =
    proposalType === "ASSIGNMENT" ? "Reject assignment request?" : "Reject removal request?";
  const tooLong = reason.trim().length > REASON_MAX;
  const reasonId = `reject-reason-${proposalId}`;

  return (
    <>
      <Button variant="secondary" onClick={() => dialogRef.current?.showModal()} disabled={disabled}>
        Reject
      </Button>

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby={`${reasonId}-title`}
      >
        <h2 id={`${reasonId}-title`} className={styles.panelHeading}>
          {title}
        </h2>

        <label className={styles.fieldLabel} htmlFor={reasonId}>
          Reason
          <span className={styles.muted}> · Optional</span>
        </label>
        <textarea
          id={reasonId}
          name="reason"
          form={formId}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={REASON_MAX}
          rows={4}
          className={[styles.control, styles.textarea].join(" ")}
          aria-invalid={tooLong ? true : undefined}
          aria-describedby={`${reasonId}-help`}
        />
        <span id={`${reasonId}-help`} className={styles.panelNote}>
          {tooLong
            ? `Use at most ${REASON_MAX} characters.`
            : "Leave this empty if there is nothing to add."}
        </span>

        <div className={styles.dialogActions}>
          <Button variant="secondary" onClick={() => dialogRef.current?.close()}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            disabled={tooLong}
            onClick={() => dialogRef.current?.close()}
          >
            Reject request
          </Button>
        </div>
      </dialog>
    </>
  );
}
