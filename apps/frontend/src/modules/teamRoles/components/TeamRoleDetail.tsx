"use client";

import { useActionState, useRef } from "react";

import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";
import { formatDate } from "@/shared/utils/formatDate";

import { EMPTY_TEAM_ROLE_STATE } from "../model/teamRoleActionState";
import type { TeamRole } from "../model/teamRoleData";
import {
  deactivateTeamRoleAction,
  reactivateTeamRoleAction,
} from "../server/actions/teamRoleActions";

import { TeamRoleForm } from "./TeamRoleForm";
import styles from "./TeamRoles.module.css";

export type TeamRoleDetailProps = {
  readonly teamRole: TeamRole;
};

/**
 * One team role: what it is, and whether it is still offered.
 *
 * Retiring is soft in both directions. A project that already requires the role
 * keeps requiring it, so nothing here talks about deleting — what changes is
 * whether it can be attached to new work.
 */
export function TeamRoleDetail({ teamRole }: TeamRoleDetailProps) {
  return (
    <div className={styles.page}>
      <section className={styles.panel} aria-labelledby="team-role-summary">
        <h2 className={styles.panelHeading} id="team-role-summary">
          Team role
        </h2>

        {!teamRole.active ? (
          <Alert tone="warning">
            This team role is retired. Projects that already require it are unchanged, but it
            cannot be added to new work.
          </Alert>
        ) : null}

        <dl className={styles.figures}>
          <div className={styles.figureRow}>
            <dt>State</dt>
            <dd>{teamRole.active ? "Available" : "Retired"}</dd>
          </div>
          <div className={styles.figureRow}>
            <dt>Created</dt>
            <dd>{formatDate(teamRole.createdAt) ?? "Not recorded"}</dd>
          </div>
          <div className={styles.figureRow}>
            <dt>Last updated</dt>
            <dd>{formatDate(teamRole.updatedAt) ?? "Not recorded"}</dd>
          </div>
        </dl>

        {/* Said on every team-role screen, because "role" already means access
            elsewhere in this product. */}
        <p className={styles.panelNote}>
          Team roles describe project staffing needs. They do not grant application
          permissions.
        </p>
      </section>

      <section className={styles.panel} aria-labelledby="team-role-edit">
        <h2 className={styles.panelHeading} id="team-role-edit">
          Edit
        </h2>
        <TeamRoleForm teamRole={teamRole} />
      </section>

      <TeamRoleStatePanel teamRole={teamRole} />
    </div>
  );
}

/**
 * Retiring and restoring.
 *
 * Two separate actions rather than one toggle, so the confirmation can say what
 * each direction actually does — and so a rename can never carry a state change
 * along with it.
 */
function TeamRoleStatePanel({ teamRole }: { readonly teamRole: TeamRole }) {
  const [deactivateState, deactivateAction, isDeactivating] = useActionState(
    deactivateTeamRoleAction,
    EMPTY_TEAM_ROLE_STATE,
  );
  const [reactivateState, reactivateAction, isReactivating] = useActionState(
    reactivateTeamRoleAction,
    EMPTY_TEAM_ROLE_STATE,
  );
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = `retire-${teamRole.teamRoleId}`;

  // Only the confirmation that agrees with the state as it is now; otherwise a
  // retire and a restore end up contradicting each other on screen.
  const confirmation = teamRole.active ? reactivateState.done : deactivateState.done;

  return (
    <section className={styles.panel} aria-labelledby="team-role-state">
      <h2 className={styles.panelHeading} id="team-role-state">
        Availability
      </h2>

      {deactivateState.error ? (
        <Alert tone="danger" title="Not changed">
          {deactivateState.error}
        </Alert>
      ) : null}
      {reactivateState.error ? (
        <Alert tone="danger" title="Not changed">
          {reactivateState.error}
        </Alert>
      ) : null}
      {confirmation ? <Alert tone="success">{confirmation}</Alert> : null}

      {teamRole.active ? (
        <>
          <p className={styles.panelNote}>
            Retiring stops this role being offered for new work. It is not deleted, and
            projects that already require it keep it.
          </p>

          <div>
            {/* Same reason as the skill link controls: a team-role name is
                bounded at 120 characters but still wider than a mobile control,
                and a button label cannot wrap. The accessible name begins with
                the visible label so the two agree (WCAG 2.5.3); the dialog
                heading below names the role in full, where it can wrap. */}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => dialogRef.current?.showModal()}
              loading={isDeactivating}
              aria-label={`Retire team role: ${teamRole.name}`}
            >
              Retire team role
            </Button>
          </div>

          <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={titleId}>
            <h2 id={titleId} className={styles.panelHeading}>
              {`Retire ${teamRole.name}?`}
            </h2>
            <div className={styles.dialogBody}>
              <p className={styles.panelNote}>
                It will no longer be offered when a project declares what it needs staffed.
              </p>
              <p className={styles.panelNote}>
                Projects that already require this role are unchanged, and it can be restored
                later.
              </p>
            </div>

            <form action={deactivateAction}>
              <input type="hidden" name="teamRoleId" value={teamRole.teamRoleId} />
              <div className={styles.dialogActions}>
                <Button variant="secondary" onClick={() => dialogRef.current?.close()}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="danger"
                  onClick={() => dialogRef.current?.close()}
                >
                  Retire team role
                </Button>
              </div>
            </form>
          </dialog>
        </>
      ) : (
        <form action={reactivateAction}>
          <input type="hidden" name="teamRoleId" value={teamRole.teamRoleId} />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            loading={isReactivating}
            aria-label={`Restore team role: ${teamRole.name}`}
          >
            Restore team role
          </Button>
        </form>
      )}
    </section>
  );
}
