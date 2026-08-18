import Link from "next/link";

import { EmptyState } from "@/shared/ui/EmptyState";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { formatDateRange } from "@/shared/utils/formatDate";
import { projectStatusLabel, projectStatusTone } from "@/shared/utils/projectStatus";

import type { ManagedProjectWithStaffing } from "../model/projectsData";
import type { ProjectsQuery } from "../model/projectsQuery";
import type { Loaded } from "../server/projectsDataSources";
import { projectPeriodLabel } from "../utils/projectPeriod";
import { staffingLabel } from "../utils/staffingSlots";

import { ProjectsLoadError } from "./ProjectsLoadError";
import styles from "./Projects.module.css";

export type ManagedProjectsViewProps = {
  readonly data: Loaded<readonly ManagedProjectWithStaffing[]>;
  readonly query: ProjectsQuery;
  readonly canCreateProject: boolean;
};

/**
 * The project manager's working set: projects this person manages, live work
 * first.
 *
 * The staffing column counts open positions — the people still to be found —
 * not understaffed role types, and not a score. A row whose detail request
 * failed says so rather than showing a zero that would read as a full team.
 */
export function ManagedProjectsView({
  data,
  query,
  canCreateProject,
}: ManagedProjectsViewProps) {
  if (!data.ok) {
    return <ProjectsLoadError>Could not load the projects you manage.</ProjectsLoadError>;
  }

  if (data.value.length === 0) {
    return (
      <EmptyState
        title={query.status ? "No projects with this status." : "No projects yet."}
        description={
          query.status
            ? "Try a different status, or clear the filter to see everything you manage."
            : undefined
        }
        action={
          canCreateProject && !query.status ? (
            <Link href="/projects/new">New project</Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className={styles.sections}>
      <div className={styles.panel}>
        <p className={styles.panelNote}>{countLabel(data.value.length)}</p>
        <table role="table" className={styles.table}>
          <thead role="rowgroup">
            <tr role="row">
              <th role="columnheader" scope="col">Project</th>
              <th role="columnheader" scope="col">Status</th>
              <th role="columnheader" scope="col">Period</th>
              <th role="columnheader" scope="col">Dates</th>
              <th role="columnheader" scope="col">Staffing</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {data.value.map((project) => (
              <tr role="row" key={project.projectId}>
                <td role="cell">
                  <Link className={styles.projectName} href={`/projects/${project.projectId}`}>
                    {project.name}
                  </Link>
                </td>
                <td role="cell" data-label="Status">
                  <StatusBadge
                    label={projectStatusLabel(project.status)}
                    tone={projectStatusTone(project.status)}
                  />
                </td>
                <td role="cell" data-label="Period">
                  {projectPeriodLabel(project.period)}
                </td>
                <td role="cell" data-label="Dates" className={styles.muted}>
                  {formatDateRange(project.startDate, project.deadlineDate)}
                </td>
                <td role="cell" data-label="Staffing">
                  {staffingLabel(project.openStaffingSlots)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function countLabel(count: number): string {
  return count === 1 ? "1 project" : `${count} projects`;
}
