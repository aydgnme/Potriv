import { HERO, WORKFLOW_STEPS } from "../../landingContent";
import { HeroFlowDiagram } from "../HeroFlowDiagram";
import styles from "../../styles/landing.module.css";
import { MarketingShell } from "../MarketingShell";

/**
 * `/how-it-works` — the staffing flow, and the seven steps that perform it.
 *
 * The flow diagram moves here from the home hero, because this is the page it
 * explains. The two relationship rules sit directly under it, as they always
 * have: they turn a line style into a stated rule.
 */
export function HowItWorksPage() {
  return (
    <MarketingShell>
      <section className={styles.section} aria-labelledby="how-it-works-title">
        <div className={styles.container}>
          <p className={styles.eyebrow}>How it works</p>
          <h1 className={styles.pageTitle} id="how-it-works-title">
            From empty workspace to a reviewed team
          </h1>

          <div className={styles.flowPanel}>
            <HeroFlowDiagram />
            <div className={styles.truthNote}>
              <p className={styles.truthLine}>
                <span className={styles.markSolid} aria-hidden="true" />
                <span>{HERO.truths[0]}</span>
              </p>
              <p className={styles.truthLine}>
                <span className={styles.markDashed} aria-hidden="true" />
                <span>{HERO.truths[1]}</span>
              </p>
            </div>
          </div>

          {/* An ordered list because the steps are a sequence, not a set. */}
          <ol className={styles.steps}>
            {WORKFLOW_STEPS.map((step) => (
              <li className={styles.step} key={step.number}>
                <span className={styles.stepNumber}>{step.number}</span>
                <h2 className={styles.stepTitle}>{step.title}</h2>
                <p className={styles.stepBody}>{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </MarketingShell>
  );
}
