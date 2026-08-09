import Link from "next/link";

import { EmptyState } from "@/shared/ui/EmptyState";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { formatDate, formatDateRange } from "@/shared/utils/formatDate";
import { projectStatusLabel, projectStatusTone } from "@/shared/utils/projectStatus";

import type { MyProjectEpisode, MyProjects } from "../model/projectsData";
import type { ProjectsQuery } from "../model/projectsQuery";
import type { Loaded } from "../server/projectsDataSources";
import { projectPeriodLabel } from "../utils/projectPeriod";

import { ProjectsLoadError } from "./ProjectsLoadError";
import styles from "./Projects.module.css";

export type MyProjectsViewProps = {
  readonly data: Loaded<MyProjects>;
  readonly query: ProjectsQuery;
};

/**
 * What this person is working on, and what they have worked on.
 *
 * Each row is an **allocation episode**, not a project. Being allocated to the
 * same project twice is two true entries, so nothing is collapsed by project id
 * — doing that would quietly delete part of someone's history.
 *
 * "Past" means the allocation ended. It does not mean the project succeeded,
 * failed or finished, and nothing here implies otherwise.
 */
export function MyProjectsView({ data, query }: MyProjectsViewProps) {
  if (!data.ok) {
    return <ProjectsLoadError>Could not load your projects.</ProjectsLoadError>;
  }

  const { currentProjects, pastProjects } = data.value;

  if (currentProjects.length === 0 && pastProjects.length === 0) {
    return (
      <EmptyState
        title={
          query.status
            ? "No allocations with this status."
            : "You are not allocated to any project yet."
        }
        description={
          query.status
            ? "Clear the filter to see every allocation you have had."
            : "Keeping your skills current is what staffing decisions are made from."
        }
        action={query.status ? undefined : <Link href="/skills">Review my skills</Link>}
      />
    );
  }

  return (
    <div className={styles.page}>
      <EpisodeGroup heading="Current projects" episodes={currentProjects} />
      <EpisodeGroup heading="Past projects" episodes={pastProjects} showEnded />
    </div>
  );
}

function EpisodeGroup({
  heading,
  episodes,
  showEnded = false,
}: {
  readonly heading: string;
  readonly episodes: readonly MyProjectEpisode[];
  readonly showEnded?: boolean;
}) {
  return (
    <section className={styles.panel} aria-labelledby={headingId(heading)}>
      <h2 className={styles.groupHeading} id={headingId(heading)}>
        {heading}
      </h2>

      {episodes.length === 0 ? (
        <p className={styles.panelNote}>None.</p>
      ) : (
        <table role="table" className={styles.table}>
          <thead role="rowgroup">
            <tr role="row">
              <th role="columnheader" scope="col">Project</th>
              <th role="columnheader" scope="col">Status</th>
              <th role="columnheader" scope="col">Roles</th>
              <th role="columnheader" scope="col">Hours/day</th>
              <th role="columnheader" scope="col">{showEnded ? "Ended" : "Dates"}</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {episodes.map((episode) => (
              // Keyed by allocation, not project: the same project can appear
              // more than once and both rows are real.
              <tr role="row" key={episode.allocationId}>
                <td role="cell">
                  <Link className={styles.projectName} href={`/projects/${episode.projectId}`}>
                    {episode.projectName}
                  </Link>
                  <span className={styles.muted}>
                    {" · "}
                    {projectPeriodLabel(episode.projectPeriod)}
                  </span>
                </td>
                <td role="cell" data-label="Status">
                  <StatusBadge
                    label={projectStatusLabel(episode.projectStatus)}
                    tone={projectStatusTone(episode.projectStatus)}
                  />
                </td>
                <td role="cell" data-label="Roles">
                  {episode.roles.length > 0
                    ? episode.roles.map((role) => role.name).join(", ")
                    : "No role recorded"}
                </td>
                <td role="cell" data-label="Hours/day">
                  {episode.workHoursPerDay}
                </td>
                <td role="cell" data-label={showEnded ? "Ended" : "Dates"} className={styles.muted}>
                  {showEnded
                    ? (formatDate(episode.deallocatedAt) ?? "Not recorded")
                    : formatDateRange(episode.startDate, episode.deadlineDate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function headingId(heading: string): string {
  return `my-projects-${heading.toLowerCase().replace(/\s+/g, "-")}`;
}
