import { formatDate } from "@/shared/utils/formatDate";

import type { Candidate } from "../model/teamFinderData";
import type { RequirementOpening } from "../utils/openRequirements";

import { ProposeAssignmentForm } from "./ProposeAssignmentForm";
import { ScoreBreakdown } from "./ScoreBreakdown";
import styles from "./TeamFinder.module.css";

export type CandidateDetailProps = {
  readonly projectId: string;
  readonly candidate: Candidate;
  readonly openings: readonly RequirementOpening[];
};

/**
 * Why this person is on the list, before whether to ask for them.
 *
 * Everything shown is evidence the backend returned: the skills that matched the
 * project's declared technologies, the past projects that matched on both a
 * technology and a target role, and the current capacity figures. Nothing is
 * inferred about how good they are or why they left anything.
 */
export function CandidateDetail({ projectId, candidate, openings }: CandidateDetailProps) {
  const { availability, employee, department } = candidate;

  return (
    <div className={styles.detail}>
      <header className={styles.detailHeader}>
        <h2 className={styles.detailName}>{employee.name}</h2>
        <p className={styles.panelNote}>
          {department?.name ?? "No department recorded"}
        </p>
      </header>

      <section className={styles.panel} aria-labelledby="candidate-availability">
        <h3 className={styles.panelHeading} id="candidate-availability">
          Availability
        </h3>
        <p>
          <strong>{capacityLabel(availability)}</strong>
          {/* An additional signal rather than a state of its own: someone can be
              partially available *and* finishing other work. */}
          {availability.closeToFinish ? " · Close to finishing other work" : ""}
        </p>
        <dl className={styles.score}>
          <div className={styles.scoreRow}>
            <dt>Available</dt>
            <dd>{`${availability.availableHours} h`}</dd>
          </div>
          <div className={styles.scoreRow}>
            <dt>Allocated</dt>
            <dd>{`${availability.allocatedHours} h`}</dd>
          </div>
          <div className={styles.scoreRow}>
            <dt>Active allocations</dt>
            <dd>{availability.activeAllocationCount}</dd>
          </div>
        </dl>

        {availability.closeToFinishProjects.length > 0 ? (
          <>
            <h4 className={styles.groupHeading}>Finishing soon</h4>
            <ul className={styles.rows}>
              {availability.closeToFinishProjects.map((project) => (
                <li key={project.projectId} className={styles.row}>
                  <span>{project.projectName}</span>
                  <span className={styles.muted}>
                    {`${project.workHoursPerDay} h/day · deadline ${
                      formatDate(project.deadlineDate) ?? "not recorded"
                    }`}
                  </span>
                </li>
              ))}
            </ul>
            {/* A deadline is when work is due, not a promise about capacity. */}
            <p className={styles.panelNote}>
              A deadline is context, not a commitment that these hours will free up.
            </p>
          </>
        ) : null}
      </section>

      <section className={styles.panel} aria-labelledby="candidate-score">
        <h3 className={styles.panelHeading} id="candidate-score">
          Score
        </h3>
        <ScoreBreakdown score={candidate.score} />
      </section>

      <section className={styles.panel} aria-labelledby="candidate-skills">
        <h3 className={styles.panelHeading} id="candidate-skills">
          Matched skills
        </h3>
        {candidate.skillMatches.length === 0 ? (
          <p className={styles.panelNote}>
            No skills matched this project&apos;s technologies.
          </p>
        ) : (
          <>
            <ul className={styles.rows}>
              {candidate.skillMatches.map((match) => (
                <li key={`${match.skillId}-${match.technologyName}`} className={styles.row}>
                  <span>
                    <strong>{match.technologyName}</strong>
                    <span className={styles.muted}>{` · ${match.skillName}`}</span>
                    {match.categoryName ? (
                      <span className={styles.muted}>{` · ${match.categoryName}`}</span>
                    ) : null}
                  </span>
                  {/* The backend's own labels, verbatim — never mapped to stars
                      or points, because they carry no points. */}
                  <span className={styles.muted}>
                    {[match.level?.label, match.experience?.label]
                      .filter(Boolean)
                      .join(" · ") || "No level recorded"}
                  </span>
                </li>
              ))}
            </ul>
            <p className={styles.panelNote}>
              Skill levels and experience are context only and do not change the Team Finder
              score.
            </p>
          </>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="candidate-past">
        <h3 className={styles.panelHeading} id="candidate-past">
          Past project matches
        </h3>
        {candidate.pastProjectMatches.length === 0 ? (
          <p className={styles.panelNote}>No past projects matched this project&apos;s work.</p>
        ) : (
          <ul className={styles.rows}>
            {candidate.pastProjectMatches.map((match) => (
              // Named, not linked: being told about a past project here does not
              // mean this manager may open it.
              <li key={match.projectId} className={styles.rowStacked}>
                <span className={styles.rowTitle}>{match.projectName}</span>
                <span className={styles.muted}>
                  {`Technologies: ${match.matchedTechnologies.join(", ") || "none"}`}
                </span>
                <span className={styles.muted}>
                  {`Roles: ${match.matchedTeamRoles.join(", ") || "none"}`}
                </span>
                <span className={styles.muted}>
                  {`Left ${formatDate(match.deallocatedAt) ?? "not recorded"}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ProposeAssignmentForm
        projectId={projectId}
        candidate={candidate}
        openings={openings}
      />
    </div>
  );
}

/** The base capacity state. Close-to-finish is reported separately. */
function capacityLabel(availability: Candidate["availability"]): string {
  if (availability.fullyAvailable) return "Fully available";
  if (availability.partiallyAvailable) return "Partially available";
  if (availability.unavailable) return "Unavailable";
  return "Availability not recorded";
}
