"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";

import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";
import { formatDate } from "@/shared/utils/formatDate";

import { DEPARTMENT_NAME_MAX } from "../model/departmentForm";
import { blockerMessage, deletionBlockers } from "../model/deletability";
import type { DepartmentDetail as DepartmentDetailData } from "../server/loadOrganization";
import { EMPTY_DEPARTMENT_STATE } from "../model/organizationActionState";
import {
  deleteDepartmentAction,
  updateDepartmentAction,
} from "../server/actions/departmentActions";

import { ManagerPicker } from "./ManagerPicker";
import styles from "./Organization.module.css";

export type DepartmentDetailProps = {
  readonly detail: DepartmentDetailData;
};

/**
 * One department: what it is, who manages it, and how to end it.
 *
 * `memberCount` is rendered as the number the contract gives. Fetching the member
 * list to decorate it would be a second request to restate a figure already in
 * hand, and the people themselves belong to their own manager's screen.
 */
export function DepartmentDetail({ detail }: DepartmentDetailProps) {
  const { department, managers } = detail;

  return (
    <div className={styles.page}>
      <section className={styles.panel} aria-labelledby="department-summary">
        <h2 className={styles.panelHeading} id="department-summary">
          Department
        </h2>
        <dl className={styles.figures}>
          <div className={styles.figureRow}>
            <dt>Members</dt>
            <dd>{department.memberCount}</dd>
          </div>
          <div className={styles.figureRow}>
            <dt>Created</dt>
            <dd>{formatDate(department.createdAt) ?? "Not recorded"}</dd>
          </div>
          <div className={styles.figureRow}>
            <dt>Last updated</dt>
            <dd>{formatDate(department.updatedAt) ?? "Not recorded"}</dd>
          </div>
        </dl>

        <RenameDepartmentForm department={department} />
      </section>

      <ManagerPicker department={department} choices={managers} />

      <DeleteDepartmentPanel detail={detail} />
    </div>
  );
}

function RenameDepartmentForm({
  department,
}: {
  readonly department: DepartmentDetailData["department"];
}) {
  const [state, formAction, isPending] = useActionState(
    updateDepartmentAction,
    EMPTY_DEPARTMENT_STATE,
  );

  return (
    <form action={formAction} className={styles.form}>
      {state.error ? (
        <Alert tone="danger" title="Not saved">
          {state.error}
        </Alert>
      ) : null}
      {state.done ? <Alert tone="success">{state.done}</Alert> : null}

      <input type="hidden" name="departmentId" value={department.departmentId} />

      <div className={styles.formRow}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="department-name">
            Name
          </label>
          <input
            id="department-name"
            name="name"
            className={styles.control}
            maxLength={DEPARTMENT_NAME_MAX}
            defaultValue={state.name ?? department.name}
            aria-describedby={state.fieldErrors?.name ? "department-name-error" : undefined}
            aria-invalid={state.fieldErrors?.name ? true : undefined}
          />
          {state.fieldErrors?.name ? (
            <p id="department-name-error" className={styles.fieldError}>
              {state.fieldErrors.name}
            </p>
          ) : null}
        </div>

        <Button type="submit" variant="secondary" loading={isPending}>
          Save name
        </Button>
      </div>
    </form>
  );
}

/**
 * Deleting the department.
 *
 * The two blockers this product can see are stated before the button is offered,
 * and each says who has to act. Clearing them is never done here — a delete that
 * quietly unassigned a manager and emptied a department would be a far larger
 * operation than the one being asked for.
 *
 * Even with both clear, the confirmation stops short of promising success: other
 * configuration can still hold the department, and only the backend knows.
 */
function DeleteDepartmentPanel({ detail }: { readonly detail: DepartmentDetailData }) {
  const { department } = detail;
  const [state, formAction, isPending] = useActionState(
    deleteDepartmentAction,
    EMPTY_DEPARTMENT_STATE,
  );
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = `delete-${department.departmentId}`;

  const blockers = deletionBlockers(department);

  return (
    <section className={styles.panel} aria-labelledby="department-delete">
      <h2 className={styles.panelHeading} id="department-delete">
        Delete department
      </h2>

      {state.error ? (
        <Alert tone="danger" title="Not deleted">
          {state.error}
        </Alert>
      ) : null}

      {blockers.length > 0 ? (
        <ul className={styles.panelNote}>
          {blockers.map((blocker) => (
            <li key={blocker.kind}>{blockerMessage(blocker)}</li>
          ))}
        </ul>
      ) : (
        <p className={styles.panelNote}>
          This removes the department structure only. It does not delete user accounts.
        </p>
      )}

      <div>
        <Button
          variant="danger"
          size="sm"
          disabled={blockers.length > 0}
          onClick={() => dialogRef.current?.showModal()}
          loading={isPending}
        >
          Delete department
        </Button>
      </div>

      <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={titleId}>
        <h2 id={titleId} className={styles.panelHeading}>
          {`Delete ${department.name}?`}
        </h2>
        <div className={styles.dialogBody}>
          <p className={styles.panelNote}>
            This removes the department structure only. It does not delete user accounts.
          </p>
          <p className={styles.panelNote}>
            The department must have no manager and no members. Other linked configuration can
            still prevent deletion.
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
              Delete department
            </Button>
          </div>
        </form>
      </dialog>

      {state.done ? (
        <Alert tone="success">
          {state.done} <Link href="/organization/departments">Back to departments</Link>
        </Alert>
      ) : null}
    </section>
  );
}
