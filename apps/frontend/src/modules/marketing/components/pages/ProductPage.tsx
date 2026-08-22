import { HERO, PILLARS } from "../../landingContent";
import { MarketingPage } from "../MarketingPage";
import styles from "../../styles/landing.module.css";

/**
 * `/product` — the canonical home of the four pillars.
 *
 * This was a `#product` section on the landing page. It is a route now, so the
 * heading it always had is its `h1`, and the product's own summary sentence
 * leads it rather than the page starting on a bare grid.
 */
export function ProductPage() {
  return (
    <MarketingPage
      href="/product"
      title="Four things Potriv keeps straight"
      titleId="product-title"
      lead={HERO.lead}
    >
      <section className={styles.section} aria-label="Product pillars">
        <div className={styles.container}>
          <ul className={styles.pillars}>
            {PILLARS.map((pillar) => (
              <li className={styles.pillar} key={pillar.number}>
                <span className={styles.pillarNumber}>{pillar.number}</span>
                <h2 className={styles.pillarTitle}>{pillar.title}</h2>
                <p className={styles.pillarBody}>{pillar.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </MarketingPage>
  );
}
