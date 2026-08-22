import {
  DECISION_RULES,
  OPERATING_MODEL,
  PROCESS_BRIEF,
  STEP_CONTEXT,
  WORKED_EXAMPLE,
} from "../../businessPlan";
import { WORKFLOW_STEPS } from "../../landingContent";
import { ChapterHeader, Continuation, PlanSection, StageRail } from "../plan";
import { HeroFlowDiagram } from "../HeroFlowDiagram";
import { MarketingShell } from "../MarketingShell";
import pageStyles from "../../styles/pages.module.css";

/**
 * Chapter 02 — how a requirement becomes an allocation.
 *
 * The diagram is the argument, so it comes early and the text around it agrees
 * with it stage for stage. The seven steps keep their wording but gain the role
 * accountable for each and the record it leaves, which is the thing a reader
 * deciding whether to adopt this actually needs.
 */
export function HowItWorksPage() {
  return (
    <MarketingShell>
      <ChapterHeader
        href="/how-it-works"
        title="From empty workspace to a reviewed team"
        titleId="how-it-works-title"
      >
        <dl className={pageStyles.brief}>
          <div>
            <dt>Inputs</dt>
            <dd>{PROCESS_BRIEF.inputs}</dd>
          </div>
          <div>
            <dt>Governed decision</dt>
            <dd>{PROCESS_BRIEF.decision}</dd>
          </div>
          <div>
            <dt>Output</dt>
            <dd>{PROCESS_BRIEF.output}</dd>
          </div>
        </dl>
      </ChapterHeader>

      <PlanSection
        index="02.1"
        title="The flow, drawn"
        titleId="how-it-works-diagram"
        lead="Five stages, and the two line styles that carry the whole distinction."
      >
        <HeroFlowDiagram />
        <ul className={pageStyles.rules}>
          {DECISION_RULES.map((rule) => (
            <li className={pageStyles.rule} key={rule.rule}>
              <span
                className={
                  rule.rule.startsWith("An accepted")
                    ? pageStyles.ruleSolid
                    : rule.rule.startsWith("A proposal")
                      ? pageStyles.ruleDashed
                      : pageStyles.ruleNone
                }
                aria-hidden="true"
              />
              <span>
                <strong className={pageStyles.ruleTitle}>{rule.rule}</strong>{" "}
                <span className={pageStyles.ruleBody}>{rule.body}</span>
              </span>
            </li>
          ))}
        </ul>
      </PlanSection>

      <PlanSection
        index="02.2"
        title="Five stages"
        titleId="how-it-works-stages"
        lead={OPERATING_MODEL.lead}
      >
        <StageRail stages={OPERATING_MODEL.stages} />
      </PlanSection>

      <PlanSection
        index="02.3"
        title="Seven steps, and who answers for each"
        titleId="how-it-works-steps"
        lead="The sequence an organization actually performs, with the record each step leaves behind."
      >
        {/* An ordered list because the steps are a sequence, not a set. */}
        <ol className={pageStyles.steps}>
          {WORKFLOW_STEPS.map((step) => {
            const context = STEP_CONTEXT[step.title];
            return (
              <li className={pageStyles.step} key={step.number}>
                <span className={pageStyles.stepNumber}>{step.number}</span>
                <div className={pageStyles.stepBody}>
                  <h3 className={pageStyles.stepTitle}>{step.title}</h3>
                  <p className={pageStyles.stepText}>{step.body}</p>
                </div>
                {context ? (
                  <dl className={pageStyles.stepMeta}>
                    <div>
                      <dt>Owner</dt>
                      <dd>{context.owner}</dd>
                    </div>
                    <div>
                      <dt>Produces</dt>
                      <dd>{context.produces}</dd>
                    </div>
                  </dl>
                ) : null}
              </li>
            );
          })}
        </ol>
      </PlanSection>

      <PlanSection
        index="02.4"
        title={WORKED_EXAMPLE.title}
        titleId="how-it-works-example"
        lead={WORKED_EXAMPLE.disclaimer}
      >
        <ol className={pageStyles.example}>
          {WORKED_EXAMPLE.rows.map((row) => (
            <li className={pageStyles.exampleRow} key={row.stage}>
              <span className={pageStyles.exampleStage}>{row.stage}</span>
              <span className={pageStyles.exampleDetail}>{row.detail}</span>
            </li>
          ))}
        </ol>
      </PlanSection>

      <Continuation from="/how-it-works" />
    </MarketingShell>
  );
}
