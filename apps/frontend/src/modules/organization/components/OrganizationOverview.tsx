import Link from "next/link";

import { Alert } from "@/shared/ui/Alert";
import { formatDate } from "@/shared/utils/formatDate";

import type { OrganizationOverview as Overview } from "../server/loadOrganization";

import styles from "./Organization.module.css";

export type OrganizationOverviewProps = {
  readonly overview: Overview;
};

/**
 * The Organization index, kept deliberately modest.
 *
 * There is no organization name here, no employee total, no utilisation and no
 * plan, because no product endpoint exposes any of them. The session carries an
 * `organizationId` and nothing else about the organization itself, and the
 * system-admin API is not this product's to borrow from. A heading reading
 * "Acme Ltd" would have to be invented, so it is absent.
 *
 * The two sections answer unrelated questions and are loaded independently: an
 * invite outage must not blank the departments summary, or the reverse.
 */
export function OrganizationOverview({ overview }: OrganizationOverviewProps) {
  return (
    <div className={styles.cards}>
      <section className={styles.panel} aria-labelledby="overview-departments">
        <h2 className={styles.panelHeading} id="overview-departments">
          Departments
        </h2>

        {overview.departments.ok ? (
          <DepartmentSummary departments={overview.departments.value} />
        ) : (
          <p className={styles.panelNote}>
            {overview.departments.reason === "FORBIDDEN"
              ? "You do not have permission to see departments."
              : "Could not load departments. Try again shortly."}
          </p>
        )}

        <Link href="/organization/departments">Open departments</Link>
      </section>

      <section className={styles.panel} aria-labelledby="overview-invite">
        <h2 className={styles.panelHeading} id="overview-invite">
          Invite link
        </h2>

        {overview.invite.kind === "ready" ? (
          <dl className={styles.figures}>
            <div className={styles.figureRow}>
              <dt>Status</dt>
              <dd>{overview.invite.invite.active ? "Active" : "Inactive"}</dd>
            </div>
            <div className={styles.figureRow}>
              <dt>Created</dt>
              <dd>{formatDate(overview.invite.invite.createdAt) ?? "Not recorded"}</dd>
            </div>
          </dl>
        ) : overview.invite.kind === "none" ? (
          <p className={styles.panelNote}>No active employee invite is available.</p>
        ) : (
          <p className={styles.panelNote}>Could not load the invite link. Try again shortly.</p>
        )}

        {/* The link itself lives on its own page; a landing summary is the wrong
            place to put a joining credential in front of somebody. */}
        <Link href="/organization/invite">Open invite</Link>
      </section>

      <section className={styles.panel} aria-labelledby="overview-team-roles">
        <h2 className={styles.panelHeading} id="overview-team-roles">
          Team roles
        </h2>

        {/* No count: the landing loads departments and the invite, and adding a
            third read to print a number would make this page slower to say less
            than the team-roles page itself does. */}
        <p className={styles.panelNote}>
          The vocabulary projects use to say what they need staffed. Team roles do not grant
          application permissions.
        </p>

        <Link href="/organization/team-roles">Open team roles</Link>
      </section>
    </div>
  );
}

function DepartmentSummary({
  departments,
}: {
  readonly departments: readonly { readonly manager: unknown | null }[];
}) {
  const unmanaged = departments.filter((department) => department.manager === null).length;

  return (
    <>
      <dl className={styles.figures}>
        <div className={styles.figureRow}>
          <dt>Departments</dt>
          <dd>{departments.length}</dd>
        </div>
        <div className={styles.figureRow}>
          <dt>Without a manager</dt>
          <dd>{unmanaged}</dd>
        </div>
      </dl>

      {unmanaged > 0 ? (
        <Alert tone="warning">
          {unmanaged === 1
            ? "One department cannot review staffing requests until a manager is appointed."
            : `${unmanaged} departments cannot review staffing requests until a manager is appointed.`}
        </Alert>
      ) : null}
    </>
  );
}
