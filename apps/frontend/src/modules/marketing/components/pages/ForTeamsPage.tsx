import { GOVERNANCE_BOUNDARIES, GOVERNANCE_SUMMARY, HANDOFF } from "../../businessPlan";
import { ROLES } from "../../landingContent";
import { ChapterHeader, Continuation, PlanSection, ResponsibilityMatrix } from "../plan";
import { MarketingShell } from "../MarketingShell";
import { RoleGlyph } from "../RoleGlyph";
import pageStyles from "../../styles/pages.module.css";

/**
 * Chapter 03 — who owns what.
 *
 * The four roles keep their existing wording, but the chapter's real content is
 * the matrix and the boundaries: what each role may do, and what it may not.
 * Every cell was read from the authority the backend enforces rather than from
 * what the role is called — an organization admin is not a superuser here, and
 * the matrix says so.
 */
export function ForTeamsPage() {
  return (
    <MarketingShell>
      <ChapterHeader
        href="/for-teams"
        title="Four responsibilities, one workspace"
        titleId="for-teams-title"
        lead={GOVERNANCE_SUMMARY.body}
      />

      <PlanSection
        index="03.1"
        title="Responsibility profiles"
        titleId="for-teams-profiles"
        lead="What each role is for, in the product's own words."
      >
        <ul className={pageStyles.profiles}>
          {ROLES.map((role) => (
            <li className={pageStyles.profile} key={role.title}>
              <h3 className={pageStyles.profileName}>
                <RoleGlyph className={pageStyles.profileGlyph} context={role.glyph} />
                {role.title}
              </h3>
              <p className={pageStyles.profileOwns}>{role.owns}</p>
              <p className={pageStyles.profileBody}>{role.body}</p>
            </li>
          ))}
        </ul>
      </PlanSection>

      <PlanSection
        index="03.2"
        title="Decisions and hand-offs"
        titleId="for-teams-matrix"
        lead="Read from what each endpoint actually enforces, not from what the role is called."
      >
        <ResponsibilityMatrix captionId="for-teams-matrix" />
      </PlanSection>

      <PlanSection
        index="03.3"
        title={HANDOFF.title}
        titleId="for-teams-handoff"
        lead="One request as it passes between them."
      >
        <ol className={pageStyles.handoff}>
          {HANDOFF.steps.map((step, index) => (
            <li className={pageStyles.handoffStep} key={step.actor}>
              <span className={pageStyles.handoffIndex} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className={pageStyles.handoffActor}>{step.actor}</h3>
              <p className={pageStyles.handoffBody}>{step.body}</p>
            </li>
          ))}
        </ol>
        <p className={pageStyles.handoffClose}>{HANDOFF.close}</p>
      </PlanSection>

      <PlanSection
        index="03.4"
        title="What each role does not own"
        titleId="for-teams-boundaries"
        lead="Each of these is a refusal the system enforces, not a convention."
      >
        <dl className={pageStyles.limits}>
          {GOVERNANCE_BOUNDARIES.map((boundary) => (
            <div className={pageStyles.limitRow} key={boundary.role}>
              <dt className={pageStyles.limitRole}>{boundary.role}</dt>
              <dd className={pageStyles.limitBody}>{boundary.limit}</dd>
            </div>
          ))}
        </dl>
      </PlanSection>

      <Continuation from="/for-teams" />
    </MarketingShell>
  );
}
