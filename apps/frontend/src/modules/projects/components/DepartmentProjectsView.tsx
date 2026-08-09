import Link from "next/link";

import { EmptyState } from "@/shared/ui/EmptyState";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { formatDateRange } from "@/shared/utils/formatDate";
import { projectStatusLabel, projectStatusTone } from "@/shared/utils/projectStatus";

import type { DepartmentProject, DepartmentProjects } from "../model/projectsData";
import type { ProjectsQuery } from "../model/projectsQuery";
import type { Loaded } from "../server/projectsDataSources";
import { projectPeriodLabel } from "../utils/projectPeriod";

import { ProjectsLoadError } from "./ProjectsLoadError";
import styles from "./Projects.module.css";

export type DepartmentProjectsViewProps = {
  readonly data: Loaded<DepartmentProjects>;
  readonly query: ProjectsQuery;
};

/**
 * What the managed department's people are committed to.
 *
 * The members column lists **this department's** active allocations on each
 * project, never the whole project team — a department manager can see their own
 * people's commitments, not everyone else's.
 *
 * No hours are summed into a capacity figure. The department's allocations on
 * these projects are not the department's whole workload, so a total would look
 * authoritative while being incomplete.
 */
export function DepartmentProjectsView({ data, query }: DepartmentProjectsViewProps) {
  if (!data.ok) {
    // Holding DEPARTMENT_MANAGER is not the same as managing a department. The
    // backend answers 403 for a manager with no appointment, and that is an
    // authority state, not an outage — "try again" would describe a failure that
    // is not happening.
    if (data.reason === "FORBIDDEN") {
      return (
        <EmptyState
          title="You are not managing a department yet."
          description="Department projects will appear here after an organization admin appoints you."
        />
      );
    }

    return <ProjectsLoadError>Could not load department projects.</ProjectsLoadError>;
  }

  const { department, projects } = data.value;

  if (projects.length === 0) {
    return (
      <EmptyState
        title={
          query.status
            ? "No projects with this status involve this department."
            : "No projects involve this department yet."
        }
        description={
          query.status ? "Clear the filter to see everything this department is on." : undefined
        }
      />
    );
  }

  return (
    <div className={styles.panel}>
      <p className={styles.panelNote}>
        {department.name} · {countLabel(projects.length)}
      </p>
      <table role="table" className={styles.table}>
        <thead role="rowgroup">
          <tr role="row">
            <th role="columnheader" scope="col">Project</th>
            <th role="columnheader" scope="col">Status</th>
            <th role="columnheader" scope="col">Period</th>
            <th role="columnheader" scope="col">Dates</th>
            <th role="columnheader" scope="col">Department members</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {projects.map((project) => (
            <tr role="row" key={project.projectId}>
              <td role="cell">
                <Link className={styles.projectName} href={`/projects/${project.projectId}`}>
                  {project.projectName}
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
              <td role="cell" data-label="Department members">
                <MemberSummary project={project} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MemberSummary({ project }: { readonly project: DepartmentProject }) {
  if (project.teamMembers.length === 0) {
    return <span className={styles.muted}>Nobody from this department</span>;
  }

  return (
    <ul className={styles.memberList}>
      {project.teamMembers.map((member) => (
        <li key={member.allocationId}>
          {member.employee.name}
          <span className={styles.muted}>
            {" — "}
            {member.roles.length > 0
              ? `${member.roles.map((role) => role.name).join(", ")}, `
              : ""}
            {hoursLabel(member.workHoursPerDay)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function hoursLabel(hours: number): string {
  return hours === 1 ? "1 hour/day" : `${hours} hours/day`;
}

function countLabel(count: number): string {
  return count === 1 ? "1 project" : `${count} projects`;
}
