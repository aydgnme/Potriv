import Link from "next/link";

import { Alert } from "@/shared/ui/Alert";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { projectStatusLabel, projectStatusTone } from "@/shared/utils/projectStatus";

import type { ManagedProjectEntry } from "../model/reviewQueue";
import { REVIEW_STATUS_TABS, staffingHref } from "../model/staffingQuery";
import type { StaffingData } from "../server/loadStaffing";
import type { Loaded } from "../server/staffingDataSources";

import { ReviewQueue } from "./ReviewQueue";
import styles from "./Staffing.module.css";

export type StaffingPageProps = {
  readonly data: StaffingData;
};

/**
 * Staffing, composed from what this person can actually do.
 *
 * A department manager reviews requests; a project manager starts them. Somebody
 * who is both sees both, with reviews first — that is work other people are
 * blocked on, and it should not be below one's own to-do list.
 *
 * There is deliberately no "requests I sent" section. The backend has no
 * PM-wide proposal list, and building one by asking every managed project for its
 * team would be inventing a feature out of N requests.
 */
export function StaffingPage({ data }: StaffingPageProps) {
  return (
    <div className={styles.page}>
      <PageHeader
        title="Staffing"
        description="Staffing is a handshake: a project manager asks, and a department manager decides."
      />

      {data.reviews !== null ? (
        <ReviewSection reviews={data.reviews} status={data.status} />
      ) : null}

      {data.managedProjects !== null ? (
        <ManagedProjectsSection projects={data.managedProjects} />
      ) : null}
    </div>
  );
}

function ReviewSection({
  reviews,
  status,
}: {
  readonly reviews: Loaded<readonly import("../model/reviewQueue").ReviewProposal[]>;
  readonly status: StaffingData["status"];
}) {
  return (
    <section className={styles.section} aria-labelledby="staffing-reviews">
      <h2 className={styles.sectionHeading} id="staffing-reviews">
        Reviews waiting on you
      </h2>

      {!reviews.ok && reviews.reason === "FORBIDDEN" ? (
        // Holding the role is not the same as managing a department. This is a
        // setup state, not an outage and not a hidden object.
        <EmptyState
          title="You are not managing a department yet."
          description="An Organization Admin must assign you to a department before you can review staffing requests."
        />
      ) : !reviews.ok ? (
        <Alert tone="warning">
          Could not load staffing requests. Refresh the page to try again.
        </Alert>
      ) : (
        <>
          <nav aria-label="Filter reviews by status" className={styles.statusNav}>
            {REVIEW_STATUS_TABS.map((tab) => {
              const active = tab.status === status;
              return (
                <Link
                  key={tab.status}
                  href={staffingHref(tab.status)}
                  aria-current={active ? "page" : undefined}
                  className={[styles.statusLink, active ? styles.statusLinkActive : null]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>

          <ReviewQueue proposals={reviews.value} status={status} />
        </>
      )}
    </section>
  );
}

function ManagedProjectsSection({
  projects,
}: {
  readonly projects: Loaded<readonly ManagedProjectEntry[]>;
}) {
  return (
    <section className={styles.section} aria-labelledby="staffing-managed">
      <h2 className={styles.sectionHeading} id="staffing-managed">
        Projects you staff
      </h2>

      {!projects.ok ? (
        <Alert tone="warning">
          Could not load the projects you manage. Refresh the page to try again.
        </Alert>
      ) : projects.value.length === 0 ? (
        <EmptyState
          title="No managed projects yet."
          description="Create a project before using Team Finder."
          action={<Link href="/projects/new">New project</Link>}
        />
      ) : (
        <ul className={styles.rows}>
          {projects.value.map((project) => (
            <li key={project.projectId} className={styles.row}>
              <div className={styles.rowMain}>
                <Link className={styles.rowTitle} href={`/projects/${project.projectId}`}>
                  {project.name}
                </Link>
              </div>
              <div className={styles.rowAside}>
                <StatusBadge
                  label={projectStatusLabel(project.status)}
                  tone={projectStatusTone(project.status)}
                />
                {/* Links, not a run: Team Finder ranks a whole organization and
                    is not something to trigger from a list on the way past. */}
                <Link href={`/projects/${project.projectId}/team-finder`}>Find team</Link>
                <Link href={`/projects/${project.projectId}/team`}>View team</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
