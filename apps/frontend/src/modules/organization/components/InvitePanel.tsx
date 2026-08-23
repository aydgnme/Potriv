"use client";

import { useActionState, useRef } from "react";

import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";
import { EmptyState } from "@/shared/ui/EmptyState";
import { FormErrorSummary } from "@/shared/ui/FormErrorSummary";
import { formatDate } from "@/shared/utils/formatDate";

import { INVITE_EMAIL_MAX } from "../model/inviteForm";
import { EMPTY_INVITE_STATE } from "../model/organizationActionState";
import type { InviteStatus, OrganizationInvite } from "../model/organizationData";
import type { InviteState } from "../server/loadOrganization";
import { inviteEmployeeAction, revokeInviteAction } from "../server/actions/inviteActions";

import styles from "./Organization.module.css";

export type InvitePanelProps = {
  readonly invite: InviteState;
};

/**
 * Invitations to this organization.
 *
 * There is no link to copy here, and that is deliberate. An invitation is issued
 * to one address, and the credential is mailed to that address by the backend —
 * it is never returned to this screen, so it cannot be forwarded, pasted into a
 * ticket, or captured in a screenshot of this page. What an administrator sees
 * is the state of each invitation, which is what they need to manage them.
 *
 * The addresses are masked by the backend. An administrator invited them and can
 * see the list, but the list is not a directory of colleagues' full addresses to
 * be read off in bulk.
 */
export function InvitePanel({ invite }: InvitePanelProps) {
  return (
    <section className={styles.panel} aria-labelledby="organization-invite">
      <h2 className={styles.panelHeading} id="organization-invite">
        Invitations
      </h2>

      <InviteEmployeeForm />

      {invite.kind === "error" ? (
        <Alert tone="danger">Could not load invitations. Try again shortly.</Alert>
      ) : invite.invites.length === 0 ? (
        <EmptyState
          title="Nobody has been invited yet."
          description="Invite someone by their work email. They will get a link that works only from their own mailbox."
        />
      ) : (
        <InviteTable invites={invite.invites} />
      )}
    </section>
  );
}

/**
 * Inviting one person.
 *
 * The address is the entire input. Nothing about the resulting invitation comes
 * back into this form beyond a confirmation sentence, because there is nothing
 * else this screen is allowed to know.
 */
function InviteEmployeeForm() {
  const [state, formAction, isPending] = useActionState(
    inviteEmployeeAction,
    EMPTY_INVITE_STATE,
  );

  return (
    <form action={formAction} className={styles.form}>
      <FormErrorSummary
        submission={state}
        formError={state.error}
        title={state.error ? "Not invited" : undefined}
        fieldErrors={state.fieldError ? { email: state.fieldError } : undefined}
        labels={{ email: "Work email" }}
      />
      {state.done ? <Alert tone="success">{state.done}</Alert> : null}

      <div className={styles.formRow}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="invite-email">
            Work email
          </label>
          <input
            id="invite-email"
            name="email"
            type="email"
            autoComplete="off"
            className={styles.control}
            maxLength={INVITE_EMAIL_MAX}
            defaultValue={state.email ?? ""}
            aria-describedby={state.fieldError ? "invite-email-error" : undefined}
            aria-invalid={state.fieldError ? true : undefined}
          />
          {state.fieldError ? (
            <p className={styles.fieldError} id="invite-email-error">
              {state.fieldError}
            </p>
          ) : null}
        </div>

        <Button type="submit" variant="primary" loading={isPending}>
          Send invitation
        </Button>
      </div>

      <p className={styles.panelNote}>
        The link goes to that address only. Inviting somebody again replaces their
        previous invitation.
      </p>
    </form>
  );
}

const STATUS_LABEL: Record<InviteStatus, string> = {
  PENDING: "Waiting to be accepted",
  ACCEPTED: "Accepted",
  EXPIRED: "Expired",
  REVOKED: "Withdrawn",
};

function InviteTable({ invites }: { readonly invites: readonly OrganizationInvite[] }) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">Invited</th>
          <th scope="col">Status</th>
          <th scope="col">Sent</th>
          <th scope="col">Expires</th>
          <th scope="col">
            <span className={styles.visuallyHidden}>Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {invites.map((entry) => (
          <tr key={entry.inviteId}>
            <td data-label="Invited">{entry.maskedEmail}</td>
            <td data-label="Status">
              {entry.status === "PENDING" ? (
                STATUS_LABEL.PENDING
              ) : (
                <span className={styles.muted}>{STATUS_LABEL[entry.status]}</span>
              )}
            </td>
            <td data-label="Sent" className={styles.muted}>
              {formatDate(entry.createdAt) ?? "Not recorded"}
            </td>
            <td data-label="Expires" className={styles.muted}>
              {formatDate(entry.expiresAt) ?? "Not recorded"}
            </td>
            <td data-label="Actions">
              {/* Only an invitation that could still be redeemed can be
                  withdrawn. Offering the action on a spent or expired one would
                  promise an effect it cannot have. */}
              {entry.status === "PENDING" ? (
                <RevokeInviteButton invite={entry} />
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Withdrawing an invitation, confirmed first.
 *
 * Irreversible in the way that matters: the person's link stops working, and
 * getting them back in means sending a new invitation. The consequence is stated
 * before the button rather than after it.
 */
function RevokeInviteButton({ invite }: { readonly invite: OrganizationInvite }) {
  const [state, formAction, isPending] = useActionState(
    revokeInviteAction,
    EMPTY_INVITE_STATE,
  );
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = `revoke-invite-${invite.inviteId}`;

  return (
    <>
      {state.error ? (
        <Alert tone="danger" title="Not withdrawn">
          {state.error}
        </Alert>
      ) : null}
      {state.done ? <Alert tone="success">{state.done}</Alert> : null}

      <Button
        variant="secondary"
        size="sm"
        onClick={() => dialogRef.current?.showModal()}
        loading={isPending}
      >
        {`Withdraw invitation for ${invite.maskedEmail}`}
      </Button>

      <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={titleId}>
        <h2 id={titleId} className={styles.panelHeading}>
          Withdraw this invitation?
        </h2>
        <div className={styles.dialogBody}>
          <p className={styles.panelNote}>
            {`The link sent to ${invite.maskedEmail} will stop working immediately.`}
          </p>
          <p className={styles.panelNote}>
            To let them join later, invite the same address again.
          </p>
        </div>

        <form action={formAction}>
          <input type="hidden" name="inviteId" value={invite.inviteId} />
          <div className={styles.dialogActions}>
            <Button variant="secondary" onClick={() => dialogRef.current?.close()}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              onClick={() => dialogRef.current?.close()}
            >
              Withdraw invitation
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
