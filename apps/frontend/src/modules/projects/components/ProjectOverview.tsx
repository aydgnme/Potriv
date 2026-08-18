import Link from "next/link";

import { Breadcrumbs } from "@/shared/ui/Breadcrumbs";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { formatDate, formatDateRange } from "@/shared/utils/formatDate";
import { projectStatusLabel, projectStatusTone } from "@/shared/utils/projectStatus";

import type { DetailsMember, ProjectDetails } from "../model/projectDetail";
import type { ProjectOverviewData } from "../server/loadProjectViews";
import { projectPeriodLabel } from "../utils/projectPeriod";
import { requirementCoverage, type RequirementCoverage } from "../utils/requirementFill";

import { ProjectContextNav } from "./ProjectContextNav";
import { ProjectUnavailable } from "./ProjectUnavailable";
import styles from "./Projects.module.css";

export type ProjectOverviewProps = {
  readonly projectId: string;
  readonly data: ProjectOverviewData;
  /** True only when this session holds PROJECT_MANAGER **and** manages this project. */
  readonly canManage: boolean;
};

/**
 * What a project is, for anyone entitled to see it.
 *
 * Every figure comes from `GET /projects/{id}/details` and `GET /projects/{id}/team`.
 * There is no health score, completion percentage, risk rating or budget here,
 * because the backend has none of them — a number on this page would be
 * invented, and an invented number on an operational screen gets acted on.
 */
export function ProjectOverview({ projectId, data, canManage }: ProjectOverviewProps) {
  if (!data.details.ok) {
    return (
      <div className={styles.page}>
        <PageHeader title="Project" />
        <ProjectUnavailable reason={data.details.reason} />
      </div>
    );
  }

  const project = data.details.value;
  // Null, not an empty list: the team read failing means proposals are unknown,
  // and "none pending" is a different statement from "we could not check".
  const proposed = data.team.ok ? data.team.value.proposedMembers : null;

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
        description={`${projectPeriodLabel(project.projectPeriod)} · ${formatDateRange(
          project.startDate,
          project.deadlineDate,
        )} · Managed by ${project.projectManager.name}`}
        actions={
          canManage ? <Link href={`/projects/${projectId}/edit`}>Edit project</Link> : undefined
        }
      />

      <ProjectContextNav projectId={projectId} active="overview" canManage={canManage} />

      <div className={styles.detailColumns}>
        <div className={styles.detailColumn}>
          <RequirementsSection project={project} proposed={proposed} teamFailed={!data.team.ok} />

          <section className={styles.panel} aria-labelledby="project-about">
            <h2 className={styles.panelHeading} id="project-about">
              About
            </h2>
            {/* Rendered as text, never as markup: this is data the backend stored. */}
            <p className={styles.longText}>
              {project.generalDescription?.trim() || "No description."}
            </p>
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

          <PeopleSection projectId={projectId} project={project} proposed={proposed} />
        </div>
      </div>
    </div>
  );
}

/**
 * What the project asked for against what it has.
 *
 * Four columns, every one of them a count of people the backend reported.
 * "Open" is `needed − active` and never subtracts proposals: a proposal is not
 * an allocation, so a role with two people proposed and none allocated is still
 * entirely open. There is no percentage and no "staffed" score, because the
 * backend has no such concept and the numbers themselves are what a manager
 * acts on.
 */
function RequirementsSection({
  project,
  proposed,
  teamFailed,
}: {
  readonly project: ProjectDetails;
  readonly proposed: readonly Pick<DetailsMember, "roles">[] | null;
  readonly teamFailed: boolean;
}) {
  return (
    <section className={styles.panel} aria-labelledby="project-requirements">
      <h2 className={styles.panelHeading} id="project-requirements">
        Team-role requirements
      </h2>

      {project.teamRoleRequirements.length === 0 ? (
        <p className={styles.panelNote}>No roles are required yet.</p>
      ) : (
        <>
          <table role="table" className={`${styles.table} ${styles.coverage}`}>
            <thead role="rowgroup">
              <tr role="row">
                <th role="columnheader" scope="col">Team role</th>
                <th role="columnheader" scope="col">Needed</th>
                <th role="columnheader" scope="col">Active</th>
                <th role="columnheader" scope="col">Proposed</th>
                <th role="columnheader" scope="col">Open</th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {project.teamRoleRequirements.map((requirement) => {
                const coverage = requirementCoverage(
                  requirement.teamRole.teamRoleId,
                  requirement.requiredMembers,
                  project.activeMembers,
                  proposed,
                );

                return (
                  <tr role="row" key={requirement.requirementId}>
                    <td role="cell">
                      <span className={styles.rowTitle}>{requirement.teamRole.name}</span>
                      {/* A word, never a colour: the role was retired after the
                          project asked for it, and the requirement still stands. */}
                      {requirement.teamRole.active ? null : (
                        <span className={styles.inactiveTag}> · retired role</span>
                      )}
                    </td>
                    <td role="cell" data-label="Needed">{coverage.required}</td>
                    <td role="cell" data-label="Active">{coverage.active}</td>
                    <td role="cell" data-label="Proposed">
                      {coverage.proposed ?? "—"}
                    </td>
                    <td role="cell" data-label="Open" className={openClass(coverage)}>
                      {coverage.open}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <p className={styles.panelNote}>
            Open counts positions still to fill. Proposed people are not allocated yet, so
            they do not reduce it.
            {teamFailed ? " Proposals could not be read, so that column is not shown." : null}
          </p>
        </>
      )}
    </section>
  );
}

/** Nothing outstanding is the quiet case, so only a real gap carries weight. */
function openClass(coverage: RequirementCoverage): string {
  return coverage.open === 0 ? styles.coverageNone : styles.coverageOpen;
}

/**
 * Who is on the project, in the three states that never merge.
 *
 * Proposed is drawn dashed and active solid — the V2 relationship grammar —
 * with each group also naming itself, so the distinction survives without the
 * pattern being read.
 */
function PeopleSection({
  projectId,
  project,
  proposed,
}: {
  readonly projectId: string;
  readonly project: ProjectDetails;
  readonly proposed: readonly {
    readonly proposalId: string;
    readonly employee: { readonly name: string };
    readonly roles: readonly { readonly name: string }[];
    readonly workHoursPerDay: number;
  }[] | null;
}) {
  return (
    <section className={styles.panel} aria-labelledby="project-people">
      <h2 className={styles.panelHeading} id="project-people">
        People
      </h2>

      <div className={styles.proposedGroup}>
        <h3 className={styles.groupHeading}>Proposed</h3>
        {proposed === null ? (
          <p className={styles.panelNote}>Pending proposals could not be read.</p>
        ) : proposed.length === 0 ? (
          <p className={styles.panelNote}>No pending proposals.</p>
        ) : (
          <ul className={styles.rows}>
            {proposed.map((member) => (
              <li key={member.proposalId} className={styles.row}>
                <div className={styles.rowMain}>
                  <span className={styles.rowTitle}>{member.employee.name}</span>
                  <span className={styles.rowMeta}>
                    {roleNames(member.roles)} · {hoursLabel(member.workHoursPerDay)} · awaiting
                    department decision
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={styles.activeGroup}>
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
      </div>

      <div className={styles.pastGroup}>
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
                    {member.deallocatedAt ? ` · until ${formatDate(member.deallocatedAt)}` : ""}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className={styles.panelNote}>
        <Link href={`/projects/${projectId}/team`}>See the full team</Link>
      </p>
    </section>
  );
}

function roleNames(roles: readonly { readonly name: string }[]): string {
  return roles.length > 0 ? roles.map((role) => role.name).join(", ") : "No role recorded";
}

function hoursLabel(hours: number): string {
  return hours === 1 ? "1 hour/day" : `${hours} hours/day`;
}
