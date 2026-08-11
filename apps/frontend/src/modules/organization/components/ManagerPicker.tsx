"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";

import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";

import type { ManagerChoices } from "../model/managerChoices";
import type { Department } from "../model/organizationData";
import { EMPTY_MANAGER_STATE } from "../model/organizationActionState";
import {
  assignDepartmentManagerAction,
  removeDepartmentManagerAction,
} from "../server/actions/managerActions";

import styles from "./Organization.module.css";

export type ManagerPickerProps = {
  readonly department: Department;
  /** Null when the people or department list could not be read. */
  readonly choices: ManagerChoices | null;
};

/**
 * Who manages this department.
 *
 * One manager per department and one department per manager, so this is a radio
 * group rather than a multi-select — there is no such thing as a co-manager here,
 * and offering checkboxes would imply one.
 *
 * Somebody managing elsewhere is shown and disabled with the reason attached,
 * not hidden. "Cara is not in the list" is a puzzle; "Cara manages QA" is an
 * answer, and it tells the admin exactly what to do about it.
 */
export function ManagerPicker({ department, choices }: ManagerPickerProps) {
  const [state, formAction, isPending] = useActionState(
    assignDepartmentManagerAction,
    EMPTY_MANAGER_STATE,
  );
  const [removeState, removeAction, isRemoving] = useActionState(
    removeDepartmentManagerAction,
    EMPTY_MANAGER_STATE,
  );

  /**
   * Appointing and removing are two forms with two action states, and each one
   * outlives the answer it described. Left alone they contradict each other: a
   * removal leaves "X is now the manager" sitting above "this department has no
   * manager", and the reassuring sentence is the false one.
   *
   * So a confirmation is only shown while it still agrees with the department as
   * it is now. Whichever action ran, the panel says one thing.
   */
  const hasManager = department.manager !== null;
  const confirmation = hasManager ? state.done : removeState.done;

  return (
    <section className={styles.panel} aria-labelledby="department-manager">
      <h2 className={styles.panelHeading} id="department-manager">
        Manager
      </h2>

      {department.manager ? (
        <p className={styles.panelNote}>
          {`${department.manager.name} manages this department.`}
        </p>
      ) : (
        <Alert tone="warning">
          This department has no manager. Staffing requests for it cannot be reviewed until
          somebody is appointed.
        </Alert>
      )}

      {state.error ? (
        <Alert tone="danger" title="Not changed">
          {state.error}
        </Alert>
      ) : null}
      {removeState.error ? (
        <Alert tone="danger" title="Not changed">
          {removeState.error}
        </Alert>
      ) : null}
      {confirmation ? <Alert tone="success">{confirmation}</Alert> : null}

      {choices === null ? (
        <p className={styles.panelNote}>
          Could not load the people who could manage this department. Try again shortly.
        </p>
      ) : choices.noneEligible ? (
        <div>
          <p className={styles.panelNote}>
            No eligible Department Managers yet. Grant the Department Manager access role to a
            person first.
          </p>
          {/* Honest about where that happens; this screen does not grant roles. */}
          <Link href="/people?view=organization">Open People</Link>
        </div>
      ) : (
        <form action={formAction} className={styles.form}>
          <input type="hidden" name="departmentId" value={department.departmentId} />

          <fieldset className={styles.choiceList} disabled={isPending}>
            <legend className={styles.fieldLabel}>Appoint a manager</legend>

            {choices.choices.map((choice) => {
              const reasonId = `manager-reason-${choice.userId}`;

              return (
                <label key={choice.userId} className={styles.choice}>
                  <input
                    type="radio"
                    name="userId"
                    value={choice.userId}
                    defaultChecked={choice.current}
                    disabled={choice.unavailable}
                    aria-describedby={choice.unavailable || choice.current ? reasonId : undefined}
                  />
                  <span className={styles.choiceBody}>
                    <span className={styles.choiceName}>{choice.name}</span>
                    <span className={styles.panelNote}>{choice.email}</span>
                    {choice.current ? (
                      <span id={reasonId} className={styles.panelNote}>
                        Current manager
                      </span>
                    ) : null}
                    {choice.unavailable ? (
                      <span id={reasonId} className={styles.panelNote}>
                        {choice.managesInstead
                          ? `Manages ${choice.managesInstead}. A person can manage only one department.`
                          : "Manages another department."}
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </fieldset>

          <div>
            <Button type="submit" variant="primary" loading={isPending}>
              Save manager
            </Button>
          </div>
        </form>
      )}

      {department.manager ? (
        <RemoveManagerButton
          department={department}
          formAction={removeAction}
          isPending={isRemoving}
        />
      ) : null}
    </section>
  );
}

/**
 * Removing the appointment, and saying what survives it.
 *
 * The role is a capability and the appointment is a posting; this ends the
 * posting. Somebody reading the confirmation should not have to guess whether
 * they are also about to demote the person, so it says outright that they are
 * not.
 *
 * The action state belongs to the panel above, not to this button: a successful
 * removal unmounts the button, and a confirmation that lives here would go with
 * it — leaving the one action with no visible outcome.
 */
function RemoveManagerButton({
  department,
  formAction,
  isPending,
}: {
  readonly department: Department;
  readonly formAction: (formData: FormData) => void;
  readonly isPending: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = `remove-manager-${department.departmentId}`;
  const managerName = department.manager?.name ?? "the manager";

  return (
    <div>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => dialogRef.current?.showModal()}
        loading={isPending}
      >
        Remove manager
      </Button>

      <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={titleId}>
        <h2 id={titleId} className={styles.panelHeading}>
          {`Remove ${managerName} as manager of ${department.name}?`}
        </h2>
        <div className={styles.dialogBody}>
          <p className={styles.panelNote}>
            Staffing requests for this department cannot be reviewed until another manager is
            appointed.
          </p>
          <p className={styles.panelNote}>
            Their Department Manager access role will not be removed.
          </p>
        </div>

        <form action={formAction}>
          <input type="hidden" name="departmentId" value={department.departmentId} />
          <div className={styles.dialogActions}>
            <Button variant="secondary" onClick={() => dialogRef.current?.close()}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              onClick={() => dialogRef.current?.close()}
            >
              Remove manager
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
