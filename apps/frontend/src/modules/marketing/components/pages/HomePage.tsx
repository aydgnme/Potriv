import Link from "next/link";

import {
  CREATE_WORKSPACE_HREF,
  FINAL_CTA,
  HERO,
  MARKETING_ROUTES,
  SIGN_IN_HREF,
} from "../../landingContent";
import { FinalCtaMotif } from "../FinalCtaMotif";
import styles from "../../styles/landing.module.css";
import { MarketingShell } from "../MarketingShell";

/**
 * `/` — the landing page, and now only that.
 *
 * It used to carry the complete bodies of Product, How it works, For teams and
 * Security, with the header linking to them as `#fragment`s. Each of those is a
 * page now, so this is the proposition, a way in to the four, and the closing
 * call to action.
 *
 * The previews carry each page's own heading and nothing else. A preview that
 * repeated the bodies would leave two canonical copies of the same claims, which
 * is the thing the split was for.
 *
 * Genuinely public: no cookie read, no session lookup, no backend call. An
 * anonymous visitor and a signed-in one are served identical bytes.
 */
export function HomePage() {
  return (
    <MarketingShell>
      <Hero />
      <RouteOverview />
      <FinalCta />
    </MarketingShell>
  );
}

function Hero() {
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={`${styles.container} ${styles.heroInner}`}>
        <div>
          <p className={styles.eyebrow}>{HERO.eyebrow}</p>
          <h1 className={styles.heroTitle} id="hero-title">
            {HERO.title}
          </h1>
          <p className={styles.heroLead}>{HERO.lead}</p>

          <div className={styles.heroActions}>
            <Link className={styles.cta} href={CREATE_WORKSPACE_HREF}>
              {HERO.primaryCta}
            </Link>
            {/* A route now, not a scroll to a section further down this page. */}
            <Link className={styles.ctaSecondary} href="/how-it-works">
              {HERO.secondaryCta}
            </Link>
          </div>

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

        <FinalCtaMotif className={styles.heroMotif} />
      </div>
    </section>
  );
}

/**
 * The four pages, named by the headings they carry.
 *
 * The section keeps `id="overview"` rather than four per-topic ids: the old
 * `/#product` style fragments cannot be server-redirected, and re-creating them
 * here would either point at stubs or duplicate the pages they replaced.
 */
function RouteOverview() {
  return (
    <section className={styles.section} id="overview" aria-labelledby="overview-title">
      <div className={styles.container}>
        <p className={styles.eyebrow}>Overview</p>
        <h2 className={styles.sectionTitle} id="overview-title">
          Four pages, one workspace
        </h2>

        <ul className={styles.overview}>
          {MARKETING_ROUTES.map((route) => (
            <li className={styles.overviewItem} key={route.href}>
              <h3 className={styles.overviewLabel}>{route.label}</h3>
              <p className={styles.overviewTitle}>{route.title}</p>
              <Link className={styles.overviewLink} href={route.href}>
                {`Read ${route.label.toLowerCase()}`}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className={styles.section} aria-labelledby="final-cta-title">
      <div className={`${styles.container} ${styles.finalInner}`}>
        <div>
          <h2 className={styles.finalTitle} id="final-cta-title">
            {FINAL_CTA.title}
          </h2>
          <p className={styles.finalBody}>{FINAL_CTA.body}</p>

          <div className={styles.heroActions}>
            <Link className={styles.cta} href={CREATE_WORKSPACE_HREF}>
              Create your workspace
            </Link>
            <Link className={styles.ctaSecondary} href={SIGN_IN_HREF}>
              Sign in
            </Link>
          </div>
        </div>

        <FinalCtaMotif className={styles.finalMotif} />
      </div>
    </section>
  );
}
