import { PILLARS } from "../../landingContent";
import styles from "../../styles/landing.module.css";
import { MarketingShell } from "../MarketingShell";

/**
 * `/product` — the canonical home of the four pillars.
 *
 * This was a `#product` section on the landing page. It is a route now, so the
 * heading it always had is its `h1` rather than one `h2` among five.
 */
export function ProductPage() {
  return (
    <MarketingShell>
      <section className={styles.section} aria-labelledby="product-title">
        <div className={styles.container}>
          <p className={styles.eyebrow}>Product</p>
          <h1 className={styles.pageTitle} id="product-title">
            Four things Potriv keeps straight
          </h1>

          <div className={styles.pillars}>
            {PILLARS.map((pillar) => (
              <div className={styles.pillar} key={pillar.number}>
                <span className={styles.pillarNumber}>{pillar.number}</span>
                <h2 className={styles.pillarTitle}>{pillar.title}</h2>
                <p className={styles.pillarBody}>{pillar.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
