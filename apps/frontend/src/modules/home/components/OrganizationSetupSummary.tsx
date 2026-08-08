import type { OrganizationDepartment, OrganizationUser } from "../model/homeData";
import type { Loaded } from "../server/homeDataSources";

import { HomeSection } from "./HomeSection";
import { SectionError } from "./SectionError";
import styles from "./Home.module.css";

export type OrganizationSetupSummaryProps = {
  readonly departments: Loaded<readonly OrganizationDepartment[]>;
  readonly users: Loaded<readonly OrganizationUser[]>;
  readonly limit: number;
};

/**
 * Structure an organization admin can act on.
 *
 * A department with no manager is the actionable item: staffing requests for it
 * cannot be reviewed by anyone until one is appointed, so it is the thing worth
 * surfacing rather than a count of everything.
 *
 * The member count is a direct count of the scoped `/users` response. There is
 * no breakdown by account status, because `UserSummaryResponse` carries none —
 * and there are no organization-wide project figures, because no endpoint gives
 * an organization admin one.
 */
export function OrganizationSetupSummary({
  departments,
  users,
  limit,
}: OrganizationSetupSummaryProps) {
  if (!departments.ok && !users.ok) {
    return (
      <HomeSection title="Organization setup">
        <SectionError>Could not load organization details.</SectionError>
      </HomeSection>
    );
  }

  const unmanaged = departments.ok
    ? departments.value.filter((department) => !department.manager)
    : [];

  return (
    <HomeSection
      title="Organization setup"
      summary={users.ok ? memberSummary(users.value.length) : undefined}
      action={{ label: "Manage organization", href: "/organization" }}
    >
      {!departments.ok ? (
        <SectionError>Could not load departments.</SectionError>
      ) : unmanaged.length === 0 ? (
        <p className={styles.empty}>
          Every department has a manager.
          {departments.value.length > 0
            ? ` ${departmentSummary(departments.value.length)}.`
            : " No departments yet."}
        </p>
      ) : (
        <>
          <p className={styles.empty}>
            {unmanaged.length === 1
              ? "1 department has no manager, so its staffing requests cannot be reviewed."
              : `${unmanaged.length} departments have no manager, so their staffing requests cannot be reviewed.`}
          </p>
          <ul className={styles.rows}>
            {unmanaged.slice(0, limit).map((department) => (
              <li key={department.departmentId} className={styles.row}>
                <div className={styles.rowMain}>
                  <span className={styles.rowTitle}>{department.name}</span>
                  <span className={styles.rowMeta}>{memberCount(department.memberCount)}</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </HomeSection>
  );
}

function memberSummary(count: number): string {
  return count === 1 ? "1 organization member" : `${count} organization members`;
}

function departmentSummary(count: number): string {
  return count === 1 ? "1 department" : `${count} departments`;
}

function memberCount(count: number): string {
  return count === 1 ? "1 member" : `${count} members`;
}
