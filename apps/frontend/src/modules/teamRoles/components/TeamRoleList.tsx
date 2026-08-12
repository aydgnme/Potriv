import Link from "next/link";

import { EmptyState } from "@/shared/ui/EmptyState";
import { formatDate } from "@/shared/utils/formatDate";

import type { TeamRole } from "../model/teamRoleData";

import styles from "./TeamRoles.module.css";

export type TeamRoleListProps = {
  readonly teamRoles: readonly TeamRole[];
  readonly includeInactive: boolean;
};

/**
 * The organization's staffing vocabulary.
 *
 * In the backend's order — name ascending — and not re-sorted. There is no
 * pagination endpoint, so the list is simply what came back.
 *
 * The note about permissions is not decoration: "role" already means something
 * else in this product, and somebody arriving here from People could reasonably
 * assume these grant access. They do not.
 */
export function TeamRoleList({ teamRoles, includeInactive }: TeamRoleListProps) {
  return (
    <div className={styles.section}>
      <div className={styles.listHeader}>
        <Link href="/organization/team-roles/new">New team role</Link>

        <Link
          href={
            includeInactive
              ? "/organization/team-roles"
              : "/organization/team-roles?includeInactive=true"
          }
        >
          {includeInactive ? "Hide retired" : "Show retired"}
        </Link>
      </div>

      <p className={styles.panelNote}>
        Team roles describe project staffing needs. They do not grant application
        permissions.
      </p>

      {teamRoles.length === 0 ? (
        <EmptyState
          title="No team roles yet."
          description="Projects declare how many people they need per role."
        />
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Description</th>
              <th scope="col">State</th>
              <th scope="col">Updated</th>
              <th scope="col">
                <span className={styles.visuallyHidden}>Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {teamRoles.map((teamRole) => (
              <tr key={teamRole.teamRoleId}>
                <td data-label="Name">
                  <span className={styles.roleName}>{teamRole.name}</span>
                </td>
                <td data-label="Description" className={styles.muted}>
                  {teamRole.description ?? "No description"}
                </td>
                <td data-label="State">
                  {teamRole.active ? (
                    "Available"
                  ) : (
                    <span className={styles.inactiveTag}>Retired</span>
                  )}
                </td>
                <td data-label="Updated" className={styles.muted}>
                  {formatDate(teamRole.updatedAt) ?? "Not recorded"}
                </td>
                <td data-label="Actions">
                  <Link href={`/organization/team-roles/${teamRole.teamRoleId}`}>
                    {`Open ${teamRole.name}`}
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
