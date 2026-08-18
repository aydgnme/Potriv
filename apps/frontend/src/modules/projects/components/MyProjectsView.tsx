import Link from "next/link";

import { EmptyState } from "@/shared/ui/EmptyState";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { formatDate, formatDateRange, formatDateTime } from "@/shared/utils/formatDate";
import { projectStatusLabel, projectStatusTone } from "@/shared/utils/projectStatus";

import type { MyProjectEpisode, MyProjects, TeamRoleSummary } from "../model/projectsData";
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
 * Where this person is allocated now, and where they were allocated before.
 *
 * Each row is an **allocation episode**, not a project. Being allocated to the
 * same project twice is two true entries, so nothing is collapsed by project id
 * — doing that would quietly delete part of someone's history, and the two
 * episodes can legitimately differ in hours, roles and dates.
 *
 * "Current" and "past" describe the *allocation*, never the project. A closed
 * project someone is still allocated to is a current allocation; an active
 * project they left is a past one. Both happen, so the headings name the
 * allocation and the page says so once in plain words.
 */
export function MyProjectsView({ data, query }: MyProjectsViewProps) {
  if (!data.ok) {
    return <ProjectsLoadError>Could not load your projects.</ProjectsLoadError>;
  }

  const { currentProjects, pastProjects, userName, generatedAt } = data.value;
  const filtered = query.status !== null;

  if (currentProjects.length === 0 && pastProjects.length === 0) {
    return (
      <EmptyState
        title={
          filtered
            ? "No allocations with this project status."
            : "You are not allocated to any project yet."
        }
        description={
          filtered
            ? "Clear the filter to see every allocation you have had."
            : "Keeping your skills current is what staffing decisions are made from."
        }
        action={
          filtered ? (
            <Link href="/projects?view=mine">Clear filter</Link>
          ) : (
            <Link href="/skills">Review my skills</Link>
          )
        }
      />
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.historyMeta}>
        <p className={styles.panelNote}>
          {/* Counts allocations, not projects: one project can supply several. */}
          {userName} · {allocationCount(currentProjects.length, "current")} ·{" "}
          {allocationCount(pastProjects.length, "past")}
        </p>
        <p className={styles.panelNote}>
          Current and past describe your allocation, not the project&rsquo;s lifecycle.
        </p>
        {formatDateTime(generatedAt) ? (
          // The moment the backend answered — not a last-updated or sync time.
          <p className={styles.panelNote}>{`Snapshot generated ${formatDateTime(generatedAt)}`}</p>
        ) : null}
      </div>

      <div className={styles.sections}>
        <EpisodeGroup
          heading="Current allocations"
          episodes={currentProjects}
          filtered={filtered}
        />
        <EpisodeGroup
          heading="Past allocations"
          episodes={pastProjects}
          filtered={filtered}
          ended
        />
      </div>
    </div>
  );
}

function EpisodeGroup({
  heading,
  episodes,
  filtered,
  ended = false,
}: {
  readonly heading: string;
  readonly episodes: readonly MyProjectEpisode[];
  readonly filtered: boolean;
  /** Past episodes have an end date; current ones deliberately do not. */
  readonly ended?: boolean;
}) {
  const id = `my-projects-${ended ? "past" : "current"}`;

  return (
    <section className={styles.panel} aria-labelledby={id}>
      <h2 className={styles.groupHeading} id={id}>
        {heading}
      </h2>

      {episodes.length === 0 ? (
        // Kept visible rather than dropped: an absent section reads as though the
        // group does not exist, and a filtered empty is not the same as none.
        <p className={styles.panelNote}>
          {filtered ? "None with this project status." : "None."}
        </p>
      ) : (
        <table role="table" className={styles.table}>
          <thead role="rowgroup">
            <tr role="row">
              <th role="columnheader" scope="col">Project</th>
              <th role="columnheader" scope="col">Project state</th>
              <th role="columnheader" scope="col">My roles</th>
              <th role="columnheader" scope="col">Hours/day</th>
              <th role="columnheader" scope="col">Allocation</th>
              <th role="columnheader" scope="col">Project stack</th>
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
                  {/* The project's own timeline, kept apart from the allocation
                      window so neither can be read as the other. */}
                  <span className={styles.metaLine}>
                    {projectPeriodLabel(episode.projectPeriod)}
                    {" · "}
                    {formatDateRange(episode.startDate, episode.deadlineDate)}
                  </span>
                </td>
                <td role="cell" data-label="Project state">
                  <StatusBadge
                    label={projectStatusLabel(episode.projectStatus)}
                    tone={projectStatusTone(episode.projectStatus)}
                  />
                </td>
                <td role="cell" data-label="My roles">
                  <RoleList roles={episode.roles} />
                </td>
                <td role="cell" data-label="Hours/day">
                  {episode.workHoursPerDay}
                </td>
                <td role="cell" data-label="Allocation" className={styles.muted}>
                  {allocationWindow(episode)}
                </td>
                <td role="cell" data-label="Project stack" className={styles.muted}>
                  {episode.technologyStack.length > 0
                    ? episode.technologyStack.map((technology) => technology.name).join(", ")
                    : "None recorded"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/**
 * The roles approved for this episode.
 *
 * A retired role is still what the allocation was approved under, so it is shown
 * and marked rather than hidden or renamed. The marker is text, not a colour.
 */
function RoleList({ roles }: { readonly roles: readonly TeamRoleSummary[] }) {
  if (roles.length === 0) return <>No role recorded</>;

  return (
    <ul className={styles.memberList}>
      {roles.map((role) => (
        <li key={role.teamRoleId}>
          {role.name}
          {role.active ? null : <span className={styles.inactiveTag}> · retired role</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * When the allocation ran — never the project's dates.
 *
 * A current episode has a start and no end, and saying so is the honest shape:
 * an open-ended window is not a missing one.
 */
function allocationWindow(episode: MyProjectEpisode): string {
  const allocated = formatDate(episode.allocatedAt) ?? "Not recorded";
  const ended = formatDate(episode.deallocatedAt);

  return ended ? `${allocated} → ${ended}` : `Allocated ${allocated}`;
}

function allocationCount(count: number, kind: "current" | "past"): string {
  return `${count} ${kind} allocation${count === 1 ? "" : "s"}`;
}
