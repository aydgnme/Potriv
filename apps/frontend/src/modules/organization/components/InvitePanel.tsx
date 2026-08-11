"use client";

import { useActionState, useRef, useState } from "react";

import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";
import { formatDate } from "@/shared/utils/formatDate";

import { EMPTY_INVITE_STATE } from "../model/organizationActionState";
import type { InviteState } from "../server/loadOrganization";
import { rotateOrganizationInviteAction } from "../server/actions/inviteActions";

import styles from "./Organization.module.css";

export type InvitePanelProps = {
  readonly invite: InviteState;
};

/**
 * The organization's employee invite link.
 *
 * The whole URL is shown in a read-only field, selectable so it works without
 * the clipboard and without JavaScript. The token is never pulled out and
 * displayed separately: on its own it is a bare credential with no context, and
 * nothing in the product needs it in that form.
 *
 * The current backend creates employee invites that never expire, so there is no
 * countdown and no expiry column. Inventing one would be a promise the contract
 * does not make.
 */
export function InvitePanel({ invite }: InvitePanelProps) {
  return (
    <section className={styles.panel} aria-labelledby="organization-invite">
      <h2 className={styles.panelHeading} id="organization-invite">
        Invite link
      </h2>

      {invite.kind === "error" ? (
        <Alert tone="danger">Could not load the invite link. Try again shortly.</Alert>
      ) : invite.kind === "none" ? (
        <>
          <p className={styles.panelNote}>No active employee invite is available.</p>
          <CreateInviteButton />
        </>
      ) : (
        <ReadyInvite invite={invite.invite} />
      )}
    </section>
  );
}

function ReadyInvite({ invite }: { readonly invite: Extract<InviteState, { kind: "ready" }>["invite"] }) {
  return (
    <>
      <dl className={styles.figures}>
        <div className={styles.figureRow}>
          <dt>Status</dt>
          <dd>{invite.active ? "Active" : "Inactive"}</dd>
        </div>
        <div className={styles.figureRow}>
          <dt>Created</dt>
          <dd>{formatDate(invite.createdAt) ?? "Not recorded"}</dd>
        </div>
      </dl>

      <div className={styles.inviteRow}>
        <label className={styles.visuallyHidden} htmlFor="invite-url">
          Organization invite link
        </label>
        <input
          id="invite-url"
          className={styles.inviteUrl}
          value={invite.inviteUrl}
          readOnly
          onFocus={(event) => event.currentTarget.select()}
        />
        <CopyInviteButton inviteUrl={invite.inviteUrl} />
      </div>

      <p className={styles.panelNote}>
        Anyone with this link can join the organization as an employee.
      </p>

      <RotateInviteButton />
    </>
  );
}

/**
 * Copying is local.
 *
 * No request, no rotation, no state change anywhere — a copy button that quietly
 * issued a write would be a trap. If the clipboard is unavailable the field is
 * still selectable, and the message says so rather than pretending it worked.
 */
function CopyInviteButton({ inviteUrl }: { readonly inviteUrl: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={copy}>
        Copy link
      </Button>
      {/* Announced, because the visible change is otherwise only a word. */}
      <span role="status" className={styles.panelNote}>
        {status === "copied"
          ? "Link copied."
          : status === "failed"
            ? "Could not copy. Select the link and copy it manually."
            : ""}
      </span>
    </>
  );
}

/**
 * Creating the first link.
 *
 * Same endpoint as rotation, but there is nothing active to revoke, so there is
 * no consequence to confirm and no dialog.
 */
function CreateInviteButton() {
  const [state, formAction, isPending] = useActionState(
    rotateOrganizationInviteAction,
    EMPTY_INVITE_STATE,
  );

  return (
    <form action={formAction}>
      {state.error ? (
        <Alert tone="danger" title="Not created">
          {state.error}
        </Alert>
      ) : null}

      <Button type="submit" variant="primary" size="sm" loading={isPending}>
        Create a new invite link
      </Button>
    </form>
  );
}

/**
 * Rotation, confirmed first.
 *
 * It reads like a refresh and behaves like a revocation: every active invite is
 * deactivated, so anybody part-way through joining with the old link is cut off.
 * That consequence is stated before the button, not after.
 */
function RotateInviteButton() {
  const [state, formAction, isPending] = useActionState(
    rotateOrganizationInviteAction,
    EMPTY_INVITE_STATE,
  );
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = "rotate-invite";

  return (
    <div>
      {state.error ? (
        <Alert tone="danger" title="Not rotated">
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
        Rotate link
      </Button>

      <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={titleId}>
        <h2 id={titleId} className={styles.panelHeading}>
          Rotate organization invite link?
        </h2>
        <div className={styles.dialogBody}>
          <p className={styles.panelNote}>The current link will stop working immediately.</p>
          <p className={styles.panelNote}>
            Anyone who has the old link will need the new one.
          </p>
        </div>

        <form action={formAction}>
          <div className={styles.dialogActions}>
            <Button variant="secondary" onClick={() => dialogRef.current?.close()}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              onClick={() => dialogRef.current?.close()}
            >
              Rotate link
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
