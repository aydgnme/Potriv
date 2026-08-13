import Link from "next/link";

import { Breadcrumbs } from "@/shared/ui/Breadcrumbs";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { formatDate, formatDateRange } from "@/shared/utils/formatDate";
import { projectStatusLabel, projectStatusTone } from "@/shared/utils/projectStatus";

import type { ProjectDetails } from "../model/projectDetail";
import type { Loaded } from "../server/projectsDataSources";
import { projectPeriodLabel } from "../utils/projectPeriod";
import { fillLabel, openLabel, requirementFill } from "../utils/requirementFill";

import { ProjectContextNav } from "./ProjectContextNav";
import { ProjectUnavailable } from "./ProjectUnavailable";
import styles from "./Projects.module.css";

export type ProjectOverviewProps = {
  readonly projectId: string;
  readonly data: Loaded<ProjectDetails>;
  /** True only when this session holds PROJECT_MANAGER **and** manages this project. */
  readonly canManage: boolean;
};

/**
 * What a project is, for anyone entitled to see it.
 *
 * Every figure comes from `GET /projects/{id}/details`. There is no health score,
 * completion percentage, risk rating or budget here, because the backend has none
 * of them — a number on this page would be invented, and an invented number on an
 * operational screen gets acted on.
 */
export function ProjectOverview({ projectId, data, canManage }: ProjectOverviewProps) {
  if (!data.ok) {
    return (
      <div className={styles.page}>
        <PageHeader title="Project" />
        <ProjectUnavailable reason={data.reason} />
      </div>
    );
  }

  const project = data.value;

  return (
    <div className={styles.page}>
      <Breadcrumbs
        trail={[{ label: "Projects", href: "/projects" }]}
        current={project.projectName}
      />
      <PageHeader
        title={project.projectName}
        status={
          <StatusBadge
            label={projectStatusLabel(project.projectStatus)}
            tone={projectStatusTone(project.projectStatus)}
          />
        }
        description={`Managed by ${project.projectManager.name}`}
        actions={
          canManage ? <Link href={`/projects/${projectId}/edit`}>Edit</Link> : undefined
        }
      />

      <ProjectContextNav projectId={projectId} active="overview" canManage={canManage} />

      <div className={styles.detailColumns}>
        <div className={styles.detailColumn}>
          <section className={styles.panel} aria-labelledby="project-about">
            <h2 className={styles.panelHeading} id="project-about">
              About
            </h2>
            {/* Rendered as text, never as markup: this is data the backend stored. */}
            <p className={styles.longText}>{project.generalDescription?.trim() || "No description."}</p>
          </section>

          <section className={styles.panel} aria-labelledby="project-schedule">
            <h2 className={styles.panelHeading} id="project-schedule">
              Schedule
            </h2>
            <dl className={styles.definitions}>
              <div>
                <dt>Period</dt>
                <dd>{projectPeriodLabel(project.projectPeriod)}</dd>
              </div>
              <div>
                <dt>Dates</dt>
                <dd>{formatDateRange(project.startDate, project.deadlineDate)}</dd>
              </div>
              <div>
                <dt>Project manager</dt>
                <dd>{project.projectManager.name}</dd>
              </div>
            </dl>
          </section>

          <section className={styles.panel} aria-labelledby="project-technologies">
            <h2 className={styles.panelHeading} id="project-technologies">
              Technology stack
            </h2>
            {/* Free-text project data, not skills — nothing here links to the
                skill catalogue, because these are not the same objects. */}
            {project.technologyStack.length === 0 ? (
              <p className={styles.panelNote}>No technologies listed.</p>
            ) : (
              <ul className={styles.chipList}>
                {project.technologyStack.map((technology) => (
                  <li key={technology.technologyId} className={styles.chip}>
                    {technology.name}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className={styles.detailColumn}>
          <section className={styles.panel} aria-labelledby="project-requirements">
            <h2 className={styles.panelHeading} id="project-requirements">
              Team-role requirements
            </h2>
            {project.teamRoleRequirements.length === 0 ? (
              <p className={styles.panelNote}>No roles are required yet.</p>
            ) : (
              <ul className={styles.rows}>
                {project.teamRoleRequirements.map((requirement) => {
                  const fill = requirementFill(
                    requirement.teamRole.teamRoleId,
                    requirement.requiredMembers,
                    project.activeMembers,
                  );

                  return (
                    <li key={requirement.requirementId} className={styles.row}>
                      <div className={styles.rowMain}>
                        <span className={styles.rowTitle}>
                          {requirement.teamRole.name}
                          {requirement.teamRole.active ? null : (
                            <span className={styles.inactiveTag}> · Inactive</span>
                          )}
                        </span>
                        <span className={styles.rowMeta}>{fillLabel(fill)}</span>
                      </div>
                      <span className={styles.rowAside}>{openLabel(fill)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className={styles.panel} aria-labelledby="project-people">
            <h2 className={styles.panelHeading} id="project-people">
              People
            </h2>

            <h3 className={styles.groupHeading}>Active</h3>
            {project.activeMembers.length === 0 ? (
              <p className={styles.panelNote}>No one is allocated to this project yet.</p>
            ) : (
              <ul className={styles.rows}>
                {project.activeMembers.map((member) => (
                  <li key={member.allocationId} className={styles.row}>
                    <div className={styles.rowMain}>
                      <span className={styles.rowTitle}>{member.employee.name}</span>
                      <span className={styles.rowMeta}>
                        {roleNames(member.roles)} · {hoursLabel(member.workHoursPerDay)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <h3 className={styles.groupHeading}>Past</h3>
            {project.pastMembers.length === 0 ? (
              <p className={styles.panelNote}>No past allocations.</p>
            ) : (
              <ul className={styles.rows}>
                {project.pastMembers.map((member) => (
                  <li key={member.allocationId} className={styles.row}>
                    <div className={styles.rowMain}>
                      <span className={styles.rowTitle}>{member.employee.name}</span>
                      <span className={styles.rowMeta}>
                        {roleNames(member.roles)}
                        {member.deallocatedAt
                          ? ` · until ${formatDate(member.deallocatedAt)}`
                          : ""}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <p className={styles.panelNote}>
              <Link href={`/projects/${projectId}/team`}>See the full team</Link>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function roleNames(roles: readonly { readonly name: string }[]): string {
  return roles.length > 0 ? roles.map((role) => role.name).join(", ") : "No role recorded";
}

function hoursLabel(hours: number): string {
  return hours === 1 ? "1 hour/day" : `${hours} hours/day`;
}
