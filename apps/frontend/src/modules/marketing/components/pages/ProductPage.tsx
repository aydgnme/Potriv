import {
  DECISION_BOUNDARY,
  OPERATING_OBJECTS,
  PILLAR_CONTEXT,
  PROBLEM_RESPONSE,
  PRODUCT_BRIEF,
} from "../../businessPlan";
import { PILLARS } from "../../landingContent";
import { ChapterHeader, Continuation, Ledger, PlanSection } from "../plan";
import { MarketingShell } from "../MarketingShell";
import styles from "../../styles/plan.module.css";
import pageStyles from "../../styles/pages.module.css";

/**
 * Chapter 01 — what the product keeps straight.
 *
 * Not the four pillars in a row. The pillars are here, all four and verbatim,
 * but they arrive after the problem they answer and carry the input, decision
 * and record each one actually produces. The chapter ends on the boundary that
 * matters most: a ranking is evidence, and evidence is not an assignment.
 */
export function ProductPage() {
  return (
    <MarketingShell>
      <ChapterHeader
        href="/product"
        title="Four things Potriv keeps straight"
        titleId="product-title"
        lead={PRODUCT_BRIEF.summary}
      />

      <PlanSection
        index="01.1"
        title="What the product answers"
        titleId="product-ledger"
        lead={PRODUCT_BRIEF.boundary}
      >
        <Ledger rows={PROBLEM_RESPONSE} />
      </PlanSection>

      <PlanSection
        index="01.2"
        title="The objects it holds"
        titleId="product-objects"
        lead="Each one becomes the next. Nothing skips a step."
      >
        <ol className={pageStyles.chain}>
          {OPERATING_OBJECTS.map((object, index) => (
            <li className={pageStyles.chainItem} key={object.name}>
              <span className={pageStyles.chainIndex} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className={pageStyles.chainName}>{object.name}</h3>
              <p className={pageStyles.chainBody}>{object.body}</p>
            </li>
          ))}
        </ol>
      </PlanSection>

      <PlanSection
        index="01.3"
        title="Four pillars, and what each produces"
        titleId="product-pillars"
      >
        <div className={pageStyles.pillarPlan}>
          {PILLARS.map((pillar) => {
            const context = PILLAR_CONTEXT[pillar.title];
            return (
              <article className={pageStyles.pillarEntry} key={pillar.number}>
                <p className={pageStyles.pillarMark}>{pillar.number}</p>
                <div>
                  <h3 className={pageStyles.pillarName}>{pillar.title}</h3>
                  <p className={pageStyles.pillarBody}>{pillar.body}</p>
                  {context ? (
                    <dl className={pageStyles.pillarFacts}>
                      <div>
                        <dt>Input</dt>
                        <dd>{context.input}</dd>
                      </div>
                      <div>
                        <dt>Decision</dt>
                        <dd>{context.decision}</dd>
                      </div>
                      <div>
                        <dt>Recorded</dt>
                        <dd>{context.record}</dd>
                      </div>
                    </dl>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </PlanSection>

      {/*
        The load-bearing claim on this page, and the one most easily lost if the
        section is ever trimmed: Team Finder writes nothing and creates no
        proposal. A test asserts this block by name.
      */}
      <PlanSection
        index="01.4"
        title={DECISION_BOUNDARY.title}
        titleId="product-boundary"
        lead={DECISION_BOUNDARY.body}
      >
        <div className={pageStyles.boundary}>
          <div className={pageStyles.boundaryScore}>
            <h3 className={pageStyles.boundaryScoreTitle}>{DECISION_BOUNDARY.score.title}</h3>
            <p className={pageStyles.boundaryScoreBody}>{DECISION_BOUNDARY.score.body}</p>
          </div>
          <ul className={pageStyles.boundaryList}>
            {DECISION_BOUNDARY.notClaimed.map((line) => (
              <li className={pageStyles.boundaryItem} key={line}>
                {line}
              </li>
            ))}
          </ul>
        </div>
      </PlanSection>

      <Continuation from="/product" />
    </MarketingShell>
  );
}
