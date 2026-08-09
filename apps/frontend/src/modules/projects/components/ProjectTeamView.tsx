import Link from "next/link";

import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { formatDate } from "@/shared/utils/formatDate";
import { projectStatusLabel, projectStatusTone } from "@/shared/utils/projectStatus";

import type {
  ActiveMember,
  MemberRole,
  PastMember,
  ProjectTeam,
  ProposedMember,
  UserSummary,
} from "../model/projectDetail";
import type { Loaded } from "../server/projectsDataSources";

import { ProjectContextNav } from "./ProjectContextNav";
import { ProjectUnavailable } from "./ProjectUnavailable";
import styles from "./Projects.module.css";

export type ProjectTeamViewProps = {
  readonly projectId: string;
  readonly data: Loaded<ProjectTeam>;
  readonly canManage: boolean;
};

/**
 * Who is on a project, in three groups that never merge.
 *
 * A proposal is not an allocation: nobody is on the project until a department
 * manager accepts it, and showing the two together would tell a manager they have
 * people they do not have. A past allocation is not a current one either. Each
 * group therefore has its own heading, its own columns and its own empty state.
 *
 * Read-only. Proposing and removing people belong to the staffing flow.
 */
export function ProjectTeamView({ projectId, data, canManage }: ProjectTeamViewProps) {
  if (!data.ok) {
    return (
      <div className={styles.page}>
        <PageHeader title="Project team" />
        <ProjectUnavailable reason={data.reason} />
      </div>
    );
  }

  const team = data.value;

  return (
    <div className={styles.page}>
      <PageHeader
        title={team.projectName}
        status={
          <StatusBadge
            label={projectStatusLabel(team.projectStatus)}
            tone={projectStatusTone(team.projectStatus)}
          />
        }
        description="Everyone proposed for, working on, or previously allocated to this project."
        actions={canManage ? <Link href={`/projects/${projectId}/edit`}>Edit</Link> : undefined}
      />

      <ProjectContextNav projectId={projectId} active="team" />

      <section className={styles.panel} aria-labelledby="team-proposed">
        <h2 className={styles.panelHeading} id="team-proposed">
          Proposed
        </h2>
        <p className={styles.panelNote}>
          Waiting on a department manager&apos;s decision. Nobody here is allocated yet.
        </p>
        {team.proposedMembers.length === 0 ? (
          <p className={styles.panelNote}>No pending proposals.</p>
        ) : (
          <table role="table" className={styles.table}>
            <thead role="rowgroup">
              <tr role="row">
                <th role="columnheader" scope="col">Employee</th>
                <th role="columnheader" scope="col">Review department</th>
                <th role="columnheader" scope="col">Roles</th>
                <th role="columnheader" scope="col">Hours/day</th>
                <th role="columnheader" scope="col">Proposed</th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {team.proposedMembers.map((member: ProposedMember) => (
                <tr role="row" key={member.proposalId}>
                  <td role="cell">
                    <span className={styles.projectName}>{member.employee.name}</span>
                    {member.comments ? (
                      <span className={styles.rowMeta}> · {member.comments}</span>
                    ) : null}
                  </td>
                  <td role="cell" data-label="Review department">
                    {member.reviewDepartment?.name ?? "Not recorded"}
                  </td>
                  <td role="cell" data-label="Roles">{roleNames(member.roles)}</td>
                  <td role="cell" data-label="Hours/day">{member.workHoursPerDay}</td>
                  <td role="cell" data-label="Proposed" className={styles.muted}>
                    {byAndWhen(member.proposedBy, member.proposedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="team-active">
        <h2 className={styles.panelHeading} id="team-active">
          Active
        </h2>
        {team.activeMembers.length === 0 ? (
          <p className={styles.panelNote}>No one is currently allocated to this project.</p>
        ) : (
          <table role="table" className={styles.table}>
            <thead role="rowgroup">
              <tr role="row">
                <th role="columnheader" scope="col">Employee</th>
                <th role="columnheader" scope="col">Review department</th>
                <th role="columnheader" scope="col">Roles</th>
                <th role="columnheader" scope="col">Hours/day</th>
                <th role="columnheader" scope="col">Allocated</th>
                <th role="columnheader" scope="col">Approved</th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {team.activeMembers.map((member: ActiveMember) => (
                <tr role="row" key={member.allocationId}>
                  <td role="cell">
                    <span className={styles.projectName}>{member.employee.name}</span>
                  </td>
                  <td role="cell" data-label="Review department">
                    {member.reviewDepartment?.name ?? "Not recorded"}
                  </td>
                  <td role="cell" data-label="Roles">{roleNames(member.roles)}</td>
                  {/* The hours this allocation takes, not a capacity figure —
                      one project cannot say what someone's whole week looks like. */}
                  <td role="cell" data-label="Hours/day">{member.workHoursPerDay}</td>
                  <td role="cell" data-label="Allocated" className={styles.muted}>
                    {formatDate(member.allocatedAt) ?? "Not recorded"}
                  </td>
                  <td role="cell" data-label="Approved" className={styles.muted}>
                    {byAndWhen(member.approvedBy, member.approvedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="team-past">
        <h2 className={styles.panelHeading} id="team-past">
          Past
        </h2>
        {team.pastMembers.length === 0 ? (
          <p className={styles.panelNote}>No past allocations.</p>
        ) : (
          <table role="table" className={styles.table}>
            <thead role="rowgroup">
              <tr role="row">
                <th role="columnheader" scope="col">Employee</th>
                <th role="columnheader" scope="col">Review department</th>
                <th role="columnheader" scope="col">Roles</th>
                <th role="columnheader" scope="col">Hours/day</th>
                <th role="columnheader" scope="col">Allocated</th>
                <th role="columnheader" scope="col">Ended</th>
                <th role="columnheader" scope="col">Reason</th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {team.pastMembers.map((member: PastMember) => (
                <tr role="row" key={member.allocationId}>
                  <td role="cell">
                    <span className={styles.projectName}>{member.employee.name}</span>
                  </td>
                  <td role="cell" data-label="Review department">
                    {member.reviewDepartment?.name ?? "Not recorded"}
                  </td>
                  <td role="cell" data-label="Roles">{roleNames(member.roles)}</td>
                  <td role="cell" data-label="Hours/day">{member.workHoursPerDay}</td>
                  <td role="cell" data-label="Allocated" className={styles.muted}>
                    {formatDate(member.allocatedAt) ?? "Not recorded"}
                  </td>
                  <td role="cell" data-label="Ended" className={styles.muted}>
                    {formatDate(member.deallocatedAt) ?? "Not recorded"}
                  </td>
                  {/* Every deallocation field is nullable — an older record may
                      predate the removal workflow — and a missing one is said
                      rather than allowed to blank the row. */}
                  <td role="cell" data-label="Reason">
                    {member.deallocationReason?.trim() || "No reason recorded"}
                    {member.deallocationApprovedBy ? (
                      <span className={styles.rowMeta}>
                        {" · "}
                        {byAndWhen(member.deallocationApprovedBy, member.deallocationApprovedAt)}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function roleNames(roles: readonly MemberRole[]): string {
  if (roles.length === 0) return "No role recorded";
  return roles.map((role) => (role.active ? role.name : `${role.name} (inactive)`)).join(", ");
}

function byAndWhen(person: UserSummary | null, when: string | null): string {
  const date = formatDate(when);
  if (person && date) return `${person.name} · ${date}`;
  if (person) return person.name;
  return date ?? "Not recorded";
}
