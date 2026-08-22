import Link from "next/link";

import {
  CONTROL_AREAS,
  NOT_CLAIMED,
  RESPONSIBILITY_BOUNDARY,
  TRUST_STATEMENT,
} from "../../businessPlan";
import {
  CREATE_WORKSPACE_HREF,
  HOME_HREF,
  SECURITY,
  SIGN_IN_HREF,
} from "../../landingContent";
import { ChapterHeader, PlanSection } from "../plan";
import { MarketingShell } from "../MarketingShell";
import pageStyles from "../../styles/pages.module.css";

/**
 * Chapter 04 — the controls, and their limits.
 *
 * The last chapter, so it does not lead anywhere: it ends on a decision rather
 * than wrapping the reader back to chapter 01.
 *
 * Every claim is one of the existing `SECURITY.facts`. What this chapter adds is
 * the shape around them — which area each belongs to, what observable behaviour
 * stands behind it, and where it stops. The limits are stated as plainly as the
 * controls, because a security page that only lists strengths is not one.
 */
export function SecurityPage() {
  const factByTitle = new Map(SECURITY.facts.map((fact) => [fact.title, fact]));

  return (
    <MarketingShell>
      <ChapterHeader
        href="/security"
        title={SECURITY.title}
        titleId="security-title"
        lead={SECURITY.intro}
        tone="dark"
      />

      <PlanSection
        index="04.1"
        title={TRUST_STATEMENT.title}
        titleId="security-trust"
        lead={TRUST_STATEMENT.body}
        tone="dark"
      >
        <ul className={pageStyles.notClaimed}>
          {NOT_CLAIMED.map((line) => (
            <li className={pageStyles.notClaimedItem} key={line}>
              {line}
            </li>
          ))}
        </ul>
      </PlanSection>

      <PlanSection
        index="04.2"
        title="Control, evidence, limitation"
        titleId="security-controls"
        lead="Each area names the claims it covers, what stands behind them, and what it does not extend to."
        tone="dark"
      >
        <div className={pageStyles.controls}>
          {CONTROL_AREAS.map((area) => (
            <article className={pageStyles.control} key={area.area}>
              <h3 className={pageStyles.controlArea}>{area.area}</h3>

              <ul className={pageStyles.controlFacts}>
                {area.facts.map((title) => {
                  const fact = factByTitle.get(title);
                  return (
                    <li key={title}>
                      <strong className={pageStyles.controlFactTitle}>{title}</strong>
                      {fact ? <span className={pageStyles.controlFactBody}>{fact.body}</span> : null}
                    </li>
                  );
                })}
              </ul>

              <dl className={pageStyles.controlMeta}>
                <div>
                  <dt>Evidence</dt>
                  <dd>{area.evidence}</dd>
                </div>
                <div>
                  <dt>Not claimed</dt>
                  <dd>{area.limit}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </PlanSection>

      <PlanSection
        index="04.3"
        title={RESPONSIBILITY_BOUNDARY.title}
        titleId="security-responsibility"
        lead="Some of this the product decides. The rest is yours, and saying so is part of the boundary."
        tone="dark"
      >
        <div className={pageStyles.split}>
          <div>
            <h3 className={pageStyles.splitTitle}>The product enforces</h3>
            <ul className={pageStyles.splitList}>
              {RESPONSIBILITY_BOUNDARY.enforced.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className={pageStyles.splitTitle}>Your organization decides</h3>
            <ul className={pageStyles.splitList}>
              {RESPONSIBILITY_BOUNDARY.organizational.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      </PlanSection>

      {/*
        The end of the plan. No "next chapter" link: wrapping back to Product
        would tell somebody who had just finished reading to start again.
      */}
      <section className={pageStyles.conclusion} aria-labelledby="security-conclusion">
        <div className={pageStyles.container}>
          <h2 className={pageStyles.conclusionTitle} id="security-conclusion">
            That is the whole plan.
          </h2>
          <p className={pageStyles.conclusionBody}>
            Five chapters: the problem, what the product holds, how a requirement
            becomes an allocation, who decides, and what is enforced. The next
            step is bounded on purpose — one department and one project.
          </p>
          <div className={pageStyles.conclusionActions}>
            <Link className={pageStyles.conclusionPrimary} href={CREATE_WORKSPACE_HREF}>
              Create your workspace
            </Link>
            <Link className={pageStyles.conclusionSecondary} href={SIGN_IN_HREF}>
              Sign in
            </Link>
            <Link className={pageStyles.conclusionQuiet} href={HOME_HREF}>
              Back to the overview
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
