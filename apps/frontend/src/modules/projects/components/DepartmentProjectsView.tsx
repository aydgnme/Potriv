import Link from "next/link";

import { EmptyState } from "@/shared/ui/EmptyState";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { formatDate, formatDateRange, formatDateTime } from "@/shared/utils/formatDate";
import { projectStatusLabel, projectStatusTone } from "@/shared/utils/projectStatus";

import type {
  DepartmentProject,
  DepartmentProjects,
  TeamRoleSummary,
} from "../model/projectsData";
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
 * The allocations still owned by staffing decisions this department reviewed.
 *
 * Membership is not what puts somebody here. A project appears because an
 * assignment proposal was reviewed *through* this department, and that
 * relationship is a snapshot: it survives the person later moving to another
 * department, and the new department does not inherit it. So the copy talks
 * about how people were staffed, never about who currently belongs where — the
 * response carries no current membership, and claiming it would be inventing
 * evidence.
 *
 * It is also active-only. A project drops out entirely once its last allocation
 * here ends, and there is no past section to build one from: this endpoint
 * answers "what is still ours", and the history question belongs to My projects.
 *
 * No hours are summed. These are one department's allocations on each project,
 * not anybody's whole workload, so a total would look authoritative while
 * being incomplete.
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

  const { department, projects, generatedAt } = data.value;

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
        action={
          query.status ? <Link href="/projects?view=department">Clear filter</Link> : undefined
        }
      />
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.historyMeta}>
        <p className={styles.panelNote}>
          {department.name} · {projectCount(projects.length)}
        </p>
        {formatDateTime(generatedAt) ? (
          <p className={styles.panelNote}>{`Snapshot generated ${formatDateTime(generatedAt)}`}</p>
        ) : null}
      </div>

      {/* One rule-separated list, not a stack of cards: these are comparable
          records in the same portfolio, and boxing each one would make the
          department read as a set of unrelated dashboards. */}
      <div className={styles.portfolioSections}>
        {projects.map((project) => (
          <PortfolioProject
            key={project.projectId}
            project={project}
            departmentName={department.name}
          />
        ))}
      </div>
    </div>
  );
}

function PortfolioProject({
  project,
  departmentName,
}: {
  readonly project: DepartmentProject;
  readonly departmentName: string;
}) {
  const headingId = `portfolio-${project.projectId}`;
  const membersId = `${headingId}-allocations`;

  return (
    <section className={styles.panel} aria-labelledby={headingId}>
      <div className={styles.portfolioHeader}>
        <h2 className={styles.groupHeading} id={headingId}>
          <Link className={styles.projectName} href={`/projects/${project.projectId}`}>
            {project.projectName}
          </Link>
        </h2>
        <StatusBadge
          label={projectStatusLabel(project.status)}
          tone={projectStatusTone(project.status)}
        />
      </div>
      <p className={styles.metaLine}>
        {projectPeriodLabel(project.period)}
        {" · "}
        {formatDateRange(project.startDate, project.deadlineDate)}
      </p>

      {/* Names the relationship the payload actually describes. Not "the team":
          the full project team spans departments and is not in this response. */}
      <h3 className={styles.subHeading} id={membersId}>
        {`Staffed through ${departmentName}`}
      </h3>

      {project.teamMembers.length === 0 ? (
        <p className={styles.panelNote}>No active allocations here.</p>
      ) : (
        <table role="table" className={styles.table} aria-labelledby={membersId}>
          <thead role="rowgroup">
            <tr role="row">
              <th role="columnheader" scope="col">Person</th>
              <th role="columnheader" scope="col">Roles</th>
              <th role="columnheader" scope="col">Hours/day</th>
              <th role="columnheader" scope="col">Allocated</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {project.teamMembers.map((member) => (
              <tr role="row" key={member.allocationId}>
                <td role="cell">
                  {/* Deliberately not a link: `/people/{id}` is organization-admin
                      only, and a department manager would land on a refusal. */}
                  {member.employee.name}
                  <span className={styles.metaLine}>{member.employee.email}</span>
                </td>
                <td role="cell" data-label="Roles">
                  <RoleList roles={member.roles} />
                </td>
                <td role="cell" data-label="Hours/day">
                  {hoursLabel(member.workHoursPerDay)}
                </td>
                <td role="cell" data-label="Allocated" className={styles.muted}>
                  {formatDate(member.allocatedAt) ?? "Not recorded"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Retired roles stay visible and marked: the allocation was approved under one. */
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

function hoursLabel(hours: number): string {
  return hours === 1 ? "1 hour/day" : `${hours} hours/day`;
}

function projectCount(count: number): string {
  return count === 1 ? "1 project" : `${count} projects`;
}
