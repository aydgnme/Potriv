"use client";

import { useActionState, useRef } from "react";

import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";
import { EmptyState } from "@/shared/ui/EmptyState";

import { EMPTY_MEMBERSHIP_STATE } from "../model/peopleActionState";
import type { DepartmentUser } from "../model/peopleData";
import type { DepartmentData } from "../server/loadPeople";
import {
  addDepartmentMemberAction,
  removeDepartmentMemberAction,
} from "../server/actions/membershipActions";

import { RoleChips } from "./OrganizationPeople";
import styles from "./People.module.css";

export type DepartmentPeopleProps = {
  readonly data: DepartmentData;
};

/**
 * Who is in this manager's department, and who is still unassigned.
 *
 * The two lists stay apart. Merging them into one table with a membership column
 * would suggest a single population with a status attribute, when they are two
 * different answers from two different endpoints — and would invite a control
 * that moves somebody between them, which no backend endpoint does.
 *
 * A department manager's authority here is membership, not access roles: roles
 * are shown as context and never edited from this screen.
 */
export function DepartmentPeople({ data }: DepartmentPeopleProps) {
  if (data.kind === "no-department") {
    if (data.reason === "ERROR") {
      return (
        <Alert tone="warning">
          Could not load your department. Refresh the page to try again.
        </Alert>
      );
    }

    // Holding DEPARTMENT_MANAGER is not the same as being appointed to one.
    return (
      <EmptyState
        title="You are not managing a department yet."
        description="An Organization Admin must appoint you to a department before you can manage membership."
      />
    );
  }

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionHeading}>{data.department.name}</h2>

      <div className={styles.twoPanes}>
        <section className={styles.panel} aria-labelledby="department-members">
          <h3 className={styles.panelHeading} id="department-members">
            Current members
          </h3>

          {!data.members.ok ? (
            // Independent of the other pane: one failing must not blank both.
            <Alert tone="warning">
              Could not load the members of this department. Refresh to try again.
            </Alert>
          ) : data.members.value.length === 0 ? (
            <p className={styles.panelNote}>Nobody is in this department yet.</p>
          ) : (
            <ul className={styles.rows}>
              {data.members.value.map((person) => (
                <li key={person.userId} className={styles.row}>
                  <PersonSummary person={person} />
                  <RemoveMemberButton person={person} departmentName={data.department.name} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="department-unassigned">
          <h3 className={styles.panelHeading} id="department-unassigned">
            Unassigned employees
          </h3>
          <p className={styles.panelNote}>
            Employees who do not belong to any department yet.
          </p>

          {!data.unassigned.ok ? (
            <Alert tone="warning">
              Could not load unassigned employees. Refresh to try again.
            </Alert>
          ) : data.unassigned.value.length === 0 ? (
            <p className={styles.panelNote}>Everyone already belongs to a department.</p>
          ) : (
            <ul className={styles.rows}>
              {data.unassigned.value.map((person) => (
                <li key={person.userId} className={styles.row}>
                  <PersonSummary person={person} />
                  <AddMemberButton person={person} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function PersonSummary({ person }: { readonly person: DepartmentUser }) {
  return (
    <div className={styles.rowMain}>
      <span className={styles.personName}>{person.name}</span>
      <span className={styles.muted}>{person.email}</span>
      {/* Read through `accessRoles` — the department contract's own field name. */}
      <RoleChips roles={person.accessRoles} />
    </div>
  );
}

function AddMemberButton({ person }: { readonly person: DepartmentUser }) {
  const [state, formAction, isPending] = useActionState(
    addDepartmentMemberAction,
    EMPTY_MEMBERSHIP_STATE,
  );

  return (
    <div className={styles.rowAside}>
      {state.error ? <span className={styles.fieldError}>{state.error}</span> : null}
      <form action={formAction}>
        <input type="hidden" name="userId" value={person.userId} />
        {/* "Add", not "Move": nobody is taken out of another department by this,
            and the backend refuses rather than reassigning. */}
        <Button type="submit" variant="secondary" size="sm" loading={isPending}>
          {`Add ${person.name} to my department`}
        </Button>
      </form>
    </div>
  );
}

function RemoveMemberButton({
  person,
  departmentName,
}: {
  readonly person: DepartmentUser;
  readonly departmentName: string;
}) {
  const [state, formAction, isPending] = useActionState(
    removeDepartmentMemberAction,
    EMPTY_MEMBERSHIP_STATE,
  );
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = `remove-${person.userId}`;

  return (
    <div className={styles.rowAside}>
      {state.error ? <span className={styles.fieldError}>{state.error}</span> : null}

      <Button
        variant="secondary"
        size="sm"
        onClick={() => dialogRef.current?.showModal()}
        loading={isPending}
      >
        {`Remove ${person.name} from the department`}
      </Button>

      <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={titleId}>
        <h2 id={titleId} className={styles.panelHeading}>
          {`Remove ${person.name} from ${departmentName}?`}
        </h2>
        {/* Exactly what happens, and what does not. */}
        <p className={styles.panelNote}>
          This removes their department membership only. It does not delete their account or
          change their access roles.
        </p>

        <form action={formAction}>
          <input type="hidden" name="userId" value={person.userId} />
          <div className={styles.dialogActions}>
            <Button variant="secondary" onClick={() => dialogRef.current?.close()}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              onClick={() => dialogRef.current?.close()}
            >
              Remove from department
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
