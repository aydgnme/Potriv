"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";
import { FormErrorSummary } from "@/shared/ui/FormErrorSummary";
import { EmptyState } from "@/shared/ui/EmptyState";
import { formatDate } from "@/shared/utils/formatDate";

import { DEPARTMENT_NAME_MAX } from "../model/departmentForm";
import type { Department } from "../model/organizationData";
import { EMPTY_DEPARTMENT_STATE } from "../model/organizationActionState";
import { createDepartmentAction } from "../server/actions/departmentActions";

import styles from "./Organization.module.css";

export type DepartmentListProps = {
  readonly departments: readonly Department[];
};

/**
 * Every department, in the order the backend returned them.
 *
 * That order is name-ascending and already correct, so it is preserved rather
 * than re-sorted — a second sort here would silently diverge the day the backend
 * changes its mind.
 *
 * The columns are exactly the contract: name, manager, member count, updated.
 * No project count, no capacity, no status, because the endpoint has none of
 * them and a column would be blank or invented.
 */
export function DepartmentList({ departments }: DepartmentListProps) {
  const unmanaged = departments.filter((department) => department.manager === null).length;

  return (
    <div className={styles.section}>
      <CreateDepartmentForm />

      {unmanaged > 0 ? (
        <Alert tone="warning">
          {unmanaged === 1
            ? "One department has no manager. Staffing requests for it cannot be reviewed until somebody is appointed."
            : `${unmanaged} departments have no manager. Staffing requests for them cannot be reviewed until somebody is appointed.`}
        </Alert>
      ) : null}

      {departments.length === 0 ? (
        <EmptyState
          title="No departments yet."
          description="Departments hold people and review staffing requests."
        />
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Manager</th>
              <th scope="col" className={styles.numeric}>
                Members
              </th>
              <th scope="col">Updated</th>
              <th scope="col">
                <span className={styles.visuallyHidden}>Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {departments.map((department) => (
              <tr key={department.departmentId}>
                <td data-label="Name">
                  <span className={styles.departmentName}>{department.name}</span>
                </td>
                <td data-label="Manager">
                  {department.manager ? (
                    department.manager.name
                  ) : (
                    <span className={styles.warning}>No manager</span>
                  )}
                </td>
                <td data-label="Members" className={styles.numeric}>
                  {department.memberCount}
                </td>
                <td data-label="Updated" className={styles.muted}>
                  {formatDate(department.updatedAt) ?? "Not recorded"}
                </td>
                <td data-label="Actions">
                  <Link href={`/organization/departments/${department.departmentId}`}>
                    {`Open ${department.name}`}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * Creating a department.
 *
 * The name is sent trimmed, matching what the backend will store, but its case is
 * left alone: uniqueness is compared lowercased, and display is not. Whether the
 * name is free is never predicted here — only the backend can answer that, and a
 * 409 comes back into this form with the value intact.
 */
function CreateDepartmentForm() {
  const [state, formAction, isPending] = useActionState(
    createDepartmentAction,
    EMPTY_DEPARTMENT_STATE,
  );

  return (
    <form action={formAction} className={styles.form}>
      <FormErrorSummary
        submission={state}
        formError={state.error}
        title={state.error ? "Not created" : undefined}
        fieldErrors={state.fieldErrors}
        labels={{ name: "Department name" }}
      />
      {state.done ? <Alert tone="success">{state.done}</Alert> : null}

      <div className={styles.formRow}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="new-department-name">
            Department name
          </label>
          <input
            id="new-department-name"
            name="name"
            className={styles.control}
            maxLength={DEPARTMENT_NAME_MAX}
            defaultValue={state.name ?? ""}
            aria-describedby={state.fieldErrors?.name ? "new-department-error" : undefined}
            aria-invalid={state.fieldErrors?.name ? true : undefined}
          />
          {state.fieldErrors?.name ? (
            <p id="new-department-error" className={styles.fieldError}>
              {state.fieldErrors.name}
            </p>
          ) : null}
        </div>

        <Button type="submit" variant="primary" loading={isPending}>
          New department
        </Button>
      </div>
    </form>
  );
}
