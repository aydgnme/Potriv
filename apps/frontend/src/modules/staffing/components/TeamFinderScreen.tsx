import Link from "next/link";

import { Alert } from "@/shared/ui/Alert";
import { EmptyState } from "@/shared/ui/EmptyState";
import { Breadcrumbs } from "@/shared/ui/Breadcrumbs";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { formatDateRange } from "@/shared/utils/formatDate";
import { projectStatusLabel, projectStatusTone } from "@/shared/utils/projectStatus";

import type { StaffingProjectContext } from "../model/teamFinderData";
import type { TeamFinderCriteriaInput } from "../model/teamFinderQuery";
import type { TeamFinderState } from "../server/loadTeamFinder";
import { openingLabel, proposableRequirements, requirementOpenings } from "../utils/openRequirements";

import { TeamFinderCriteriaForm } from "./TeamFinderCriteriaForm";
import { TeamFinderResults } from "./TeamFinderResults";
import styles from "./TeamFinder.module.css";

export type TeamFinderScreenProps = {
  readonly projectId: string;
  readonly criteria: TeamFinderCriteriaInput;
  readonly state: TeamFinderState;
};

/**
 * Team Finder: who matches this project's declared work, and why.
 *
 * Deterministic, not clever. The backend ranks people by exact-normalized
 * matches between the project's technologies and their recorded skills, by past
 * projects that shared both a technology and a target role, and by current
 * capacity. Nothing here is called a recommendation, and no candidate is called
 * a good fit — the screen shows the arithmetic and lets a manager decide.
 */
export function TeamFinderScreen({ projectId, criteria, state }: TeamFinderScreenProps) {
  if (state.kind === "unavailable") {
    return (
      <div className={styles.page}>
        <PageHeader title="Team Finder" />
        {state.reason === "ERROR" ? (
          <Alert tone="warning">Could not load this project. Refresh the page to try again.</Alert>
        ) : (
          // The same sentence a missing project gets: being refused must not
          // confirm that this one is real.
          <EmptyState
            title="This project does not exist or is not visible to you."
            description="If you were expecting to see it, ask the project manager to check your allocation."
          />
        )}
      </div>
    );
  }

  const project = state.project;

  if (state.kind === "not-owner") {
    return (
      <div className={styles.page}>
        <ProjectContextHeader project={project} />
        <EmptyState
          title="Only this project's manager can staff it."
          description="You can read this project, but staffing it belongs to the manager who owns it."
          action={<Link href={`/projects/${projectId}`}>Back to overview</Link>}
        />
      </div>
    );
  }

  if (state.kind === "no-technologies") {
    return (
      <div className={styles.page}>
        <ProjectContextHeader project={project} />
        {/* Not "no candidates matched" — nothing was searched. Matching is
            between the project's technologies and people's skills, and this
            project has declared none. */}
        <EmptyState
          title="This project has no technologies to match on yet."
          description="Add technologies in Project settings before running Team Finder."
          action={<Link href={`/projects/${projectId}/edit`}>Edit project</Link>}
        />
      </div>
    );
  }

  const openings = proposableRequirements(project);

  return (
    <div className={styles.page}>
      <ProjectContextHeader project={project} />

      <TeamFinderCriteriaForm
        criteria={criteria}
        effective={state.result.ok ? state.result.value.criteria : null}
      />

      {!state.result.ok ? (
        <Alert tone="warning">
          {state.result.reason === "NOT_FOUND"
            ? "This project does not exist or is not visible to you."
            : "Could not run Team Finder. Refresh the page to try again."}
        </Alert>
      ) : state.result.value.candidates.length === 0 ? (
        <EmptyState
          title="No candidates matched these criteria."
          description="Widening who to include — partially available or unavailable people — may return more."
        />
      ) : (
        <TeamFinderResults
          projectId={projectId}
          result={state.result.value}
          openings={openings}
        />
      )}
    </div>
  );
}

/** What the project asks for, so a candidate can be judged against something. */
function ProjectContextHeader({ project }: { readonly project: StaffingProjectContext }) {
  const openings = requirementOpenings(project);

  return (
    <>
      <Breadcrumbs
        trail={[
          { label: "Projects", href: "/projects" },
          { label: project.projectName, href: `/projects/${project.projectId}` },
        ]}
        current="Find team"
      />
      <PageHeader
        title={project.projectName}
        status={
          <StatusBadge
            label={projectStatusLabel(project.projectStatus)}
            tone={projectStatusTone(project.projectStatus)}
          />
        }
        description="Team Finder ranks people by matched skills, past project matches and current availability."
        actions={<Link href={`/projects/${project.projectId}`}>Back to overview</Link>}
      />

      <div className={styles.contextRow}>
        <section className={styles.panel} aria-labelledby="finder-project">
          <h2 className={styles.panelHeading} id="finder-project">
            What this project needs
          </h2>
          <p className={styles.panelNote}>
            {formatDateRange(project.startDate, project.deadlineDate)}
          </p>

          <h3 className={styles.groupHeading}>Technologies</h3>
          {project.technologyStack.length === 0 ? (
            <p className={styles.panelNote}>None declared.</p>
          ) : (
            <ul className={styles.chipList}>
              {project.technologyStack.map((technology) => (
                <li key={technology.technologyId} className={styles.chip}>
                  {technology.name}
                </li>
              ))}
            </ul>
          )}

          <h3 className={styles.groupHeading}>Role requirements</h3>
          {openings.length === 0 ? (
            <p className={styles.panelNote}>
              None declared. Skills still match on technologies; past-project similarity has no
              roles to compare against.
            </p>
          ) : (
            <ul className={styles.rows}>
              {openings.map((opening) => (
                <li key={opening.requirement.requirementId} className={styles.row}>
                  <span>
                    {opening.requirement.teamRole.name}
                    {opening.requirement.teamRole.active ? null : (
                      <span className={styles.muted}> · Inactive</span>
                    )}
                  </span>
                  <span className={styles.muted}>
                    {`${openingLabel(opening)} · ${opening.open} still needed`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
