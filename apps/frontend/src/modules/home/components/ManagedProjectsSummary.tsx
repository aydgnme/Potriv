import Link from "next/link";

import { StatusBadge } from "@/shared/ui/StatusBadge";

import type { ManagedProjectWithStaffing } from "../model/homeData";
import type { Loaded } from "../server/homeDataSources";
import { staffingLabel } from "../utils/staffingGap";
import { projectStatusLabel, projectStatusTone } from "../utils/projectStatus";

import { HomeSection } from "./HomeSection";
import { SectionError } from "./SectionError";
import styles from "./Home.module.css";

export type ManagedProjectsSummaryProps = {
  readonly data: Loaded<readonly ManagedProjectWithStaffing[]>;
  readonly limit: number;
};

/**
 * Projects this user manages, ordered so live work comes first.
 *
 * The staffing figure counts open positions — the people still to be found —
 * not understaffed role types, and not a score. Only the shortlist is enriched;
 * anything beyond it says "Staffing not checked" rather than implying a full
 * team.
 *
 * The action says "Staff project", never "Assign": a project manager proposes,
 * and a department manager decides.
 */
export function ManagedProjectsSummary({ data, limit }: ManagedProjectsSummaryProps) {
  if (!data.ok) {
    return (
      <HomeSection title="Projects you manage">
        <SectionError>Could not load the projects you manage.</SectionError>
      </HomeSection>
    );
  }

  const projects = data.value.slice(0, limit);

  return (
    <HomeSection
      title="Projects you manage"
      summary={data.value.length === 0 ? undefined : summaryFor(data.value.length)}
      action={{ label: "View managed projects", href: "/projects" }}
    >
      {projects.length === 0 ? (
        <p className={styles.empty}>You do not manage any projects yet.</p>
      ) : (
        <ul className={styles.rows}>
          {projects.map((project) => (
            <li key={project.projectId} className={styles.row}>
              <div className={styles.rowMain}>
                <Link className={styles.rowTitle} href={`/projects/${project.projectId}`}>
                  {project.name}
                </Link>
                <span className={styles.rowMeta}>
                  {staffingLabel(project.openStaffingSlots)}
                </span>
              </div>
              <div className={styles.rowAside}>
                <StatusBadge
                  label={projectStatusLabel(project.status)}
                  tone={projectStatusTone(project.status)}
                />
                <Link className={styles.rowMeta} href={`/projects/${project.projectId}`}>
                  Staff project
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </HomeSection>
  );
}

function summaryFor(count: number): string {
  return count === 1 ? "1 managed project" : `${count} managed projects`;
}
