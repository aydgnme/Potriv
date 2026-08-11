import Link from "next/link";

import { Alert } from "@/shared/ui/Alert";
import { PageHeader } from "@/shared/ui/PageHeader";

import type { PeopleScope, PeopleView } from "../model/peopleQuery";
import { peopleHref } from "../model/peopleQuery";
import type { PeopleData } from "../server/loadPeople";

import { DepartmentPeople } from "./DepartmentPeople";
import { OrganizationPeople } from "./OrganizationPeople";
import styles from "./People.module.css";

export type PeoplePageProps = {
  readonly views: readonly PeopleScope[];
  readonly active: PeopleView;
  readonly data: PeopleData;
  readonly currentUserId: string;
};

/**
 * One People domain answering two different questions.
 *
 * An organization admin asks who belongs to the organization and what they can
 * do; a department manager asks who is in their department and who is still
 * unassigned. Different endpoints, different authority — so this is a capability
 * union, not a role switcher, and only the active view's data is loaded.
 */
export function PeoplePage({ views, active, data, currentUserId }: PeoplePageProps) {
  return (
    <div className={styles.page}>
      <PageHeader
        title="People"
        description={
          active === "organization"
            ? "Everyone in your organization, and what they can do."
            : "Who is in your department, and who is still unassigned."
        }
      />

      {views.length > 1 ? (
        <nav aria-label="People views" className={styles.viewNav}>
          {views.map((scope) => {
            const isActive = scope.view === active;
            return (
              <Link
                key={scope.view}
                href={peopleHref(scope.view)}
                aria-current={isActive ? "page" : undefined}
                className={[styles.viewLink, isActive ? styles.viewLinkActive : null]
                  .filter(Boolean)
                  .join(" ")}
              >
                {scope.label}
              </Link>
            );
          })}
        </nav>
      ) : null}

      {data.view === "organization" ? (
        data.users.ok ? (
          <OrganizationPeople users={data.users.value} currentUserId={currentUserId} />
        ) : (
          <Alert tone="warning">
            Could not load the people in your organization. Refresh the page to try again.
          </Alert>
        )
      ) : (
        <DepartmentPeople data={data.department} />
      )}
    </div>
  );
}
