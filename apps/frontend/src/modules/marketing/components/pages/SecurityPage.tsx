import { SECURITY } from "../../landingContent";
import styles from "../../styles/landing.module.css";
import { MarketingShell } from "../MarketingShell";

/**
 * `/security` — every claim, bounded by the `SECURITY` constants.
 *
 * Nothing is written into this page directly. Each line is a property of the
 * system as built and checkable in this repository, and no certification,
 * compliance regime or third-party audit is claimed, because none has happened.
 */
export function SecurityPage() {
  return (
    <MarketingShell>
      <section className={styles.security} aria-labelledby="security-title">
        <div className={`${styles.container} ${styles.securityInner}`}>
          <p className={styles.securityEyebrow}>{SECURITY.eyebrow}</p>
          <h1 className={styles.securityPageTitle} id="security-title">
            {SECURITY.title}
          </h1>
          <p className={styles.securityIntro}>{SECURITY.intro}</p>

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
    </MarketingShell>
  );
}
