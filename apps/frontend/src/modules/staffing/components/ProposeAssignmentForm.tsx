"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";

import { EMPTY_PROPOSAL_STATE } from "../model/proposalState";
import type { Candidate } from "../model/teamFinderData";
import { proposeAssignmentAction } from "../server/actions/proposalActions";
import type { RequirementOpening } from "../utils/openRequirements";

import styles from "./TeamFinder.module.css";

export type ProposeAssignmentFormProps = {
  readonly projectId: string;
  readonly candidate: Candidate;
  /** Active requirements that still want people, as the project stands now. */
  readonly openings: readonly RequirementOpening[];
};

/**
 * Asking for someone, not taking them.
 *
 * The action is "Propose", never "Assign" or "Add to team": this creates a
 * request that a department manager reviews, and the employee's own manager may
 * decline it. Copy that implied otherwise would be describing a permission this
 * screen does not have.
 *
 * Hours are bounded by the candidate's current available hours, from the finder
 * payload. Nothing here knows how long a working day is — the backend has that
 * constant and does not send it, so the browser does not guess at it.
 */
export function ProposeAssignmentForm({
  projectId,
  candidate,
  openings,
}: ProposeAssignmentFormProps) {
  const [state, formAction, isPending] = useActionState(
    proposeAssignmentAction,
    EMPTY_PROPOSAL_STATE,
  );

  const availableHours = candidate.availability.availableHours;
  const hasCapacity = availableHours > 0;

  // Unmet roles start selected — they are the reason to propose someone — and
  // can be unticked, but not all of them.
  const [selectedRoles, setSelectedRoles] = useState<readonly string[]>(() =>
    openings.map((opening) => opening.requirement.teamRole.teamRoleId),
  );
  const [hours, setHours] = useState(() => String(Math.min(availableHours || 1, 4)));

  function toggleRole(teamRoleId: string) {
    setSelectedRoles((current) =>
      current.includes(teamRoleId)
        ? current.filter((id) => id !== teamRoleId)
        : [...current, teamRoleId],
    );
  }

  if (state.sentTo) {
    return (
      <section className={styles.panel} aria-labelledby="proposal-sent">
        <h3 className={styles.panelHeading} id="proposal-sent">
          Proposal sent
        </h3>
        {/* Named from the backend's response: the review department is
            snapshotted server-side and is not ours to guess. */}
        {/* A request, not a result. Nobody is on the project until the
            department accepts, so the copy never says joined or allocated. */}
        <Alert tone="success">
          {`Waiting for department review — sent to ${state.sentTo}. Nobody is allocated yet.`}
        </Alert>
        <p>
          <Link href={`/projects/${projectId}/team`}>View project team</Link>
        </p>
      </section>
    );
  }

  if (openings.length === 0) {
    return (
      <section className={styles.panel} aria-labelledby="proposal-blocked">
        <h3 className={styles.panelHeading} id="proposal-blocked">
          Send staffing proposal
        </h3>
        <p className={styles.panelNote}>
          Every active role requirement on this project is already filled. Add or raise a
          requirement before proposing anyone else.
        </p>
        <p>
          <Link href={`/projects/${projectId}/edit`}>Project settings</Link>
        </p>
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-labelledby="proposal-form">
      <h3 className={styles.panelHeading} id="proposal-form">
        Propose for this project
      </h3>
      <p className={styles.panelNote}>
        A department manager reviews this before anyone joins the project.
      </p>

      {state.formError ? (
        <Alert tone="danger" title="This was not sent">
          {state.formError}
        </Alert>
      ) : null}

      {hasCapacity ? null : (
        <Alert tone="warning">
          {/* Finishing other work soon is evidence about the future, not hours
              that exist today. */}
          This person has no available hours right now, so they cannot be proposed yet.
        </Alert>
      )}

      <form action={formAction} className={styles.proposalForm}>
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="employeeId" value={candidate.employee.userId} />

        <fieldset className={styles.fieldset} disabled={isPending || !hasCapacity}>
          <legend className={styles.legend}>Roles</legend>
          {state.fieldErrors.teamRoleIds ? (
            <p className={styles.fieldError} id="role-error">
              {state.fieldErrors.teamRoleIds}
            </p>
          ) : null}
          {openings.map((opening) => {
            const teamRoleId = opening.requirement.teamRole.teamRoleId;
            return (
              <label key={teamRoleId} className={styles.checkbox}>
                <input
                  type="checkbox"
                  name="teamRoleId"
                  value={teamRoleId}
                  checked={selectedRoles.includes(teamRoleId)}
                  onChange={() => toggleRole(teamRoleId)}
                  aria-describedby={state.fieldErrors.teamRoleIds ? "role-error" : undefined}
                />
                {opening.requirement.teamRole.name}
                <span className={styles.muted}>
                  {` · ${opening.open} still needed`}
                </span>
              </label>
            );
          })}
        </fieldset>

        <fieldset className={styles.fieldset} disabled={isPending || !hasCapacity}>
          <legend className={styles.legend}>Commitment</legend>

          <label className={styles.inlineField} htmlFor="work-hours">
            <span className={styles.inlineLabel}>Hours per day</span>
          </label>
          <input
            id="work-hours"
            name="workHoursPerDay"
            type="number"
            min={1}
            max={availableHours > 0 ? availableHours : undefined}
            step={1}
            value={hours}
            onChange={(event) => setHours(event.target.value)}
            className={[styles.control, styles.hoursInput].join(" ")}
            aria-invalid={state.fieldErrors.workHoursPerDay ? true : undefined}
            aria-describedby={
              state.fieldErrors.workHoursPerDay ? "hours-error" : "hours-hint"
            }
          />
          <span id="hours-hint" className={styles.panelNote}>
            {`${availableHours} h available today.`}
          </span>
          {state.fieldErrors.workHoursPerDay ? (
            <span id="hours-error" className={styles.fieldError}>
              {state.fieldErrors.workHoursPerDay}
            </span>
          ) : null}

          <label className={styles.inlineField} htmlFor="proposal-comments">
            <span className={styles.inlineLabel}>Comments</span>
          </label>
          <textarea
            id="proposal-comments"
            name="comments"
            maxLength={5000}
            rows={3}
            className={[styles.control, styles.textarea].join(" ")}
            aria-invalid={state.fieldErrors.comments ? true : undefined}
            aria-describedby={state.fieldErrors.comments ? "comments-error" : undefined}
          />
          {state.fieldErrors.comments ? (
            <span id="comments-error" className={styles.fieldError}>
              {state.fieldErrors.comments}
            </span>
          ) : null}
        </fieldset>

        <Button
          type="submit"
          variant="primary"
          loading={isPending}
          disabled={!hasCapacity || selectedRoles.length === 0 || invalidHours(hours, availableHours)}
        >
          Send proposal
        </Button>
      </form>
    </section>
  );
}

/** The client's share of the guard. The backend remains the authority on capacity. */
function invalidHours(raw: string, availableHours: number): boolean {
  const hours = Number(raw.trim());
  return !Number.isInteger(hours) || hours < 1 || hours > availableHours;
}
