import { SECURITY } from "../../landingContent";
import { MarketingPage } from "../MarketingPage";
import styles from "../../styles/landing.module.css";

/**
 * `/security` — every claim, bounded by the `SECURITY` constants.
 *
 * Nothing is written into this page directly. Each line is a property of the
 * system as built and checkable in this repository, and no certification,
 * compliance regime or third-party audit is claimed, because none has happened.
 */
export function SecurityPage() {
  return (
    <MarketingPage
      href="/security"
      title={SECURITY.title}
      titleId="security-title"
      lead={SECURITY.intro}
      tone="dark"
    >
      <section className={styles.security} aria-label="Security properties">
        <div className={`${styles.container} ${styles.securityInner}`}>
          <ul className={styles.facts}>
            {SECURITY.facts.map((fact) => (
              <li className={styles.fact} key={fact.title}>
                <h2 className={styles.factTitle}>{fact.title}</h2>
                <p className={styles.factBody}>{fact.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </MarketingPage>
  );
}
