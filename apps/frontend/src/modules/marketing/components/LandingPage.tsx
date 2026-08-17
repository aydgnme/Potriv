import Link from "next/link";

import {
  CREATE_WORKSPACE_HREF,
  FINAL_CTA,
  HERO,
  LANDING_SECTIONS,
  PILLARS,
  ROLES,
  SECURITY,
  SIGN_IN_HREF,
  WORKFLOW_STEPS,
} from "../landingContent";
import { HeroFlowDiagram } from "./HeroFlowDiagram";
import { MarketingHeader } from "./MarketingHeader";
import { RoleGlyph } from "./RoleGlyph";
import { FinalCtaMotif } from "./FinalCtaMotif";
import styles from "../styles/landing.module.css";

/**
 * The public landing page.
 *
 * A server component holding server components: the only client boundary on the
 * page is the header's mobile menu. Nothing here reads a cookie, a session or a
 * backend, which is what makes `/` genuinely public — an anonymous visitor and a
 * signed-in one are served the same bytes.
 *
 * Heading structure is one h1 (the hero) and one h2 per section, in document
 * order, so the page can be navigated by heading alone.
 */
export function LandingPage() {
  return (
    <div className={styles.page}>
      <MarketingHeader />

      <main id="main">
        <Hero />
        <ValuePillars />
        <Workflow />
        <RoleResponsibilities />
        <SecuritySection />
        <FinalCta />
      </main>

      <MarketingFooter />
    </div>
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
            <a className={styles.ctaSecondary} href="#how-it-works">
              {HERO.secondaryCta}
            </a>
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

        <HeroFlowDiagram />
      </div>
    </section>
  );
}

function ValuePillars() {
  return (
    <section className={styles.section} id="product" aria-labelledby="product-title">
      <div className={styles.container}>
        <p className={styles.eyebrow}>Product</p>
        <h2 className={styles.sectionTitle} id="product-title">
          Four things Potriv keeps straight
        </h2>

        <div className={styles.pillars}>
          {PILLARS.map((pillar) => (
            <div className={styles.pillar} key={pillar.number}>
              <span className={styles.pillarNumber}>{pillar.number}</span>
              <h3 className={styles.pillarTitle}>{pillar.title}</h3>
              <p className={styles.pillarBody}>{pillar.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Workflow() {
  return (
    <section className={styles.section} id="how-it-works" aria-labelledby="how-it-works-title">
      <div className={styles.container}>
        <p className={styles.eyebrow}>How it works</p>
        <h2 className={styles.sectionTitle} id="how-it-works-title">
          From empty workspace to a reviewed team
        </h2>

        {/* An ordered list because the steps are a sequence, not a set. */}
        <ol className={styles.steps}>
          {WORKFLOW_STEPS.map((step) => (
            <li className={styles.step} key={step.number}>
              <span className={styles.stepNumber}>{step.number}</span>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepBody}>{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function RoleResponsibilities() {
  return (
    <section className={styles.section} id="for-teams" aria-labelledby="for-teams-title">
      <div className={styles.container}>
        <p className={styles.eyebrow}>For teams</p>
        <h2 className={styles.sectionTitle} id="for-teams-title">
          Four responsibilities, one workspace
        </h2>
        <p className={styles.sectionIntro}>
          A person holds the roles they have been granted. There is no role
          switcher, and no role can act outside what the backend allows it.
        </p>

        <ul className={styles.roles}>
          {ROLES.map((role) => (
            <li className={styles.role} key={role.title}>
              <h3 className={styles.roleHeading}>
                <RoleGlyph className={styles.roleIcon} />
                {role.title}
              </h3>
              <div>
                <p className={styles.roleOwns}>{role.owns}</p>
                <p className={styles.roleBody}>{role.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function SecuritySection() {
  return (
    <section className={styles.security} id="security" aria-labelledby="security-title">
      <div className={`${styles.container} ${styles.securityInner}`}>
        <p className={styles.securityEyebrow}>{SECURITY.eyebrow}</p>
        <h2 className={styles.securityTitle} id="security-title">
          {SECURITY.title}
        </h2>
        <p className={styles.securityIntro}>{SECURITY.intro}</p>

        <ul className={styles.facts}>
          {SECURITY.facts.map((fact) => (
            <li className={styles.fact} key={fact.title}>
              <h3 className={styles.factTitle}>{fact.title}</h3>
              <p className={styles.factBody}>{fact.body}</p>
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

function MarketingFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`${styles.container} ${styles.footerInner}`}>
        <p className={styles.footerBrand}>
          <span className={styles.footerWordmark}>POTRIV</span> · Team allocation
          and skill matching
        </p>

        {/* Only links to places that exist. No legal or company pages are
            invented to fill the row out. */}
        <ul className={styles.footerLinks}>
          {LANDING_SECTIONS.map((section) => (
            <li key={section.id}>
              <a className={styles.footerLink} href={`#${section.id}`}>
                {section.label}
              </a>
            </li>
          ))}
          <li>
            <Link className={styles.footerLink} href={SIGN_IN_HREF}>
              Sign in
            </Link>
          </li>
        </ul>
      </div>
    </footer>
  );
}
