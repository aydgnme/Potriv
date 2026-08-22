import { HERO, WORKFLOW_STEPS } from "../../landingContent";
import { HeroFlowDiagram } from "../HeroFlowDiagram";
import { MarketingPage } from "../MarketingPage";
import styles from "../../styles/landing.module.css";

/**
 * `/how-it-works` — the staffing flow, and the seven steps that perform it.
 *
 * The flow diagram lives here rather than on the landing hero, because this is
 * the page it explains. The two relationship rules sit directly under it, as
 * they always have: they turn a line style into a stated rule.
 */
export function HowItWorksPage() {
  return (
    <MarketingPage
      href="/how-it-works"
      title="From empty workspace to a reviewed team"
      titleId="how-it-works-title"
    >
      <section className={styles.section} aria-label="The staffing flow">
        <div className={styles.container}>
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
        </div>
      </section>

      <section className={styles.section} aria-label="The seven steps">
        <div className={styles.container}>
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
    </MarketingPage>
  );
}
