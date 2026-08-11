"use client";

import Link from "next/link";
import { useState } from "react";

import { PRODUCT_ACCESS_ROLES, roleLabel, type AccessRole } from "@/shared/types/accessRole";
import { EmptyState } from "@/shared/ui/EmptyState";

import type { OrganizationUser } from "../model/peopleData";

import styles from "./People.module.css";

export type OrganizationPeopleProps = {
  readonly users: readonly OrganizationUser[];
  readonly currentUserId: string;
};

type RoleFilter = AccessRole | "ALL";

/**
 * Everyone in the organization, and what they can do.
 *
 * The columns are exactly what `GET /users` returns: name, email, roles. There
 * is no account status, no department and no last-login, because the backend has
 * none of them — a column here would either be blank or invented, and decorating
 * rows by fanning out department endpoints would answer a question this screen
 * is not asking.
 *
 * Filtering is local. The list is already loaded and there is no server-side
 * people search, so refetching on a filter change would spend a request to
 * return the same rows.
 */
export function OrganizationPeople({ users, currentUserId }: OrganizationPeopleProps) {
  const [filter, setFilter] = useState<RoleFilter>("ALL");

  const visible = filter === "ALL" ? users : users.filter((user) => user.roles.includes(filter));
  const soloOrganization = users.length === 1 && users[0]?.userId === currentUserId;

  return (
    <div className={styles.section}>
      <div className={styles.listHeader}>
        <label className={styles.inlineField}>
          <span className={styles.inlineLabel}>Show</span>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as RoleFilter)}
            className={styles.control}
          >
            <option value="ALL">All roles</option>
            {/* `SYSTEM_ADMIN` is absent from this union by construction, so the
                ordinary product cannot offer it even by accident. */}
            {PRODUCT_ACCESS_ROLES.map((role) => (
              <option key={role} value={role}>
                {roleLabel(role)}
              </option>
            ))}
          </select>
        </label>

        {/* A count of what was loaded — there is no pagination to imply. */}
        <p className={styles.panelNote}>{countLabel(visible.length, users.length, filter)}</p>
      </div>

      {/* A founder alone still gets their own row: the one place self-editing is
          allowed is their detail page, and replacing the table with a message
          would leave nothing in the product that links to it. */}
      {soloOrganization ? (
        <div className={styles.soloNote}>
          <p className={styles.personName}>Only you so far.</p>
          <p className={styles.panelNote}>Share your organization invite link to add people.</p>
        </div>
      ) : null}

      {visible.length === 0 && filter !== "ALL" ? (
        <EmptyState
          title={`No people have the ${roleLabel(filter)} role.`}
          action={
            <button type="button" className={styles.linkButton} onClick={() => setFilter("ALL")}>
              Clear filter
            </button>
          }
        />
      ) : (
        <table role="table" className={styles.table}>
          <thead role="rowgroup">
            <tr role="row">
              <th role="columnheader" scope="col">Name</th>
              <th role="columnheader" scope="col">Email</th>
              <th role="columnheader" scope="col">Access roles</th>
              <th role="columnheader" scope="col">
                <span className={styles.visuallyHidden}>Actions</span>
              </th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {visible.map((user) => (
              <tr role="row" key={user.userId}>
                <td role="cell">
                  <span className={styles.personName}>{user.name}</span>
                  {user.userId === currentUserId ? (
                    <span className={styles.muted}> · You</span>
                  ) : null}
                </td>
                <td role="cell" data-label="Email" className={styles.muted}>
                  {user.email}
                </td>
                <td role="cell" data-label="Access roles">
                  <RoleChips roles={user.roles} />
                </td>
                <td role="cell" data-label="Actions">
                  <Link href={`/people/${user.userId}`}>{`Open ${user.name}`}</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Capability labels, not severity states — so no traffic lights. */
export function RoleChips({ roles }: { readonly roles: readonly AccessRole[] }) {
  const shown = roles.filter((role) => PRODUCT_ACCESS_ROLES.includes(role));

  if (shown.length === 0) return <span className={styles.muted}>No roles recorded</span>;

  return (
    <ul className={styles.chipList}>
      {shown.map((role) => (
        <li key={role} className={styles.chip}>
          {roleLabel(role)}
        </li>
      ))}
    </ul>
  );
}

function countLabel(visible: number, total: number, filter: RoleFilter): string {
  const noun = total === 1 ? "person" : "people";
  return filter === "ALL" ? `${total} ${noun}` : `${visible} of ${total} ${noun}`;
}
