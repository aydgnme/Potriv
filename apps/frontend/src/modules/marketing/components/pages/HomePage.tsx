import Link from "next/link";

import { OPERATING_MODEL, OPERATING_PROBLEM, PLAN_CHAPTERS } from "../../businessPlan";
import {
  CREATE_WORKSPACE_HREF,
  FINAL_CTA,
  HERO,
  SIGN_IN_HREF,
} from "../../landingContent";
import { PlanSection, StageRail } from "../plan";
import { MarketingShell } from "../MarketingShell";
import styles from "../../styles/plan.module.css";
import pageStyles from "../../styles/pages.module.css";

/**
 * Chapter 00 — the executive overview.
 *
 * A summary, not a hero with four title links. It states the proposition, the
 * coordination gap the product exists for, the sequence it puts in its place,
 * and then the four chapters with the question each one answers — so a reader
 * can choose where to go rather than being told four nouns.
 *
 * It deliberately holds none of the four bodies. Two canonical copies of the
 * same claim is what splitting the pages was for.
 *
 * Genuinely public: no cookie read, no session lookup, no backend call. An
 * anonymous visitor and a signed-in one are served identical bytes.
 */
export function HomePage() {
  return (
    <MarketingShell>
      <section className={pageStyles.hero} aria-labelledby="hero-title">
        <div className={styles.container}>
          <p className={pageStyles.heroEyebrow}>{HERO.eyebrow}</p>
          <h1 className={pageStyles.heroTitle} id="hero-title">
            {HERO.title}
          </h1>
          <p className={pageStyles.heroLead}>{HERO.lead}</p>

          <div className={pageStyles.heroActions}>
            <Link className={pageStyles.heroPrimary} href={CREATE_WORKSPACE_HREF}>
              {HERO.primaryCta}
            </Link>
            <Link className={pageStyles.heroSecondary} href="/how-it-works">
              {HERO.secondaryCta}
            </Link>
          </div>
        </div>
      </section>

      <PlanSection
        index="00.1"
        title={OPERATING_PROBLEM.title}
        titleId="home-problem"
        lead={OPERATING_PROBLEM.lead}
      >
        <ul className={pageStyles.gaps}>
          {OPERATING_PROBLEM.gaps.map((gap) => (
            <li className={pageStyles.gap} key={gap.title}>
              <h3 className={pageStyles.gapTitle}>{gap.title}</h3>
              <p className={pageStyles.gapBody}>{gap.body}</p>
            </li>
          ))}
        </ul>
      </PlanSection>

      <PlanSection
        index="00.2"
        title={OPERATING_MODEL.title}
        titleId="home-model"
        lead={OPERATING_MODEL.lead}
      >
        <StageRail stages={OPERATING_MODEL.stages} />
        <div className={pageStyles.grammar}>
          <p className={pageStyles.grammarLine}>
            <span className={pageStyles.markSolid} aria-hidden="true" />
            <span>{HERO.truths[0]}</span>
          </p>
          <p className={pageStyles.grammarLine}>
            <span className={pageStyles.markDashed} aria-hidden="true" />
            <span>{HERO.truths[1]}</span>
          </p>
        </div>
      </PlanSection>

      {/*
        The chapter index. Each entry carries the question that chapter answers,
        which is what makes this a table of contents rather than four nouns.
      */}
      <PlanSection
        index="00.3"
        title="The plan, in four chapters"
        titleId="home-chapters"
        lead="Each answers one question. They are meant to be read in order, but they do not have to be."
      >
        <ol className={pageStyles.chapters}>
          {PLAN_CHAPTERS.map((chapter) => (
            <li className={pageStyles.chapterEntry} key={chapter.href}>
              <p className={pageStyles.chapterEntryMark}>
                <span className={pageStyles.chapterEntryNumber}>{chapter.number}</span>
                <span className={pageStyles.chapterEntryLabel}>{chapter.label}</span>
              </p>
              <h3 className={pageStyles.chapterEntryQuestion}>{chapter.question}</h3>
              <p className={pageStyles.chapterEntrySummary}>{chapter.summary}</p>
              <Link className={pageStyles.chapterEntryLink} href={chapter.href}>
                {`Read chapter ${chapter.number}`}
              </Link>
            </li>
          ))}
        </ol>
      </PlanSection>

      <section className={pageStyles.start} aria-labelledby="home-start">
        <div className={pageStyles.container}>
          <h2 className={pageStyles.startTitle} id="home-start">
            {FINAL_CTA.title}
          </h2>
          <p className={pageStyles.startBody}>{FINAL_CTA.body}</p>
          <div className={pageStyles.startActions}>
            <Link className={pageStyles.heroPrimary} href={CREATE_WORKSPACE_HREF}>
              Create your workspace
            </Link>
            <Link className={pageStyles.heroSecondary} href={SIGN_IN_HREF}>
              Sign in
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
