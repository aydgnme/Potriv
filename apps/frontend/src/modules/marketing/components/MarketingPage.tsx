import Link from "next/link";
import type { ReactNode } from "react";

import {
  CREATE_WORKSPACE_HREF,
  FINAL_CTA,
  MARKETING_ROUTES,
  SIGN_IN_HREF,
} from "../landingContent";
import styles from "../styles/landing.module.css";
import { MarketingShell } from "./MarketingShell";

/**
 * The frame every marketing subpage shares.
 *
 * The four pages were a heading and one row of content each, ending straight
 * into the footer — a fragment of a page rather than a page. This gives each of
 * them the three things a product page is expected to have: a header band that
 * states what the page is, the content, and a way onward. Nobody should reach
 * the bottom of Product and find that the only thing to do is scroll back up.
 *
 * No copy is written here. The lead is whichever existing sentence already
 * described that section, the closing call to action is the one the landing page
 * uses, and "next" is derived from the order of `MARKETING_ROUTES`.
 */
export type MarketingPageProps = {
  /** The route this page serves, used for the eyebrow and the next link. */
  readonly href: string;
  readonly title: string;
  readonly titleId: string;
  /** An existing sentence describing the page. Omitted where none exists. */
  readonly lead?: string;
  /** `dark` for Security, which keeps its inverted panel. */
  readonly tone?: "default" | "dark";
  readonly children: ReactNode;
};

export function MarketingPage({
  href,
  title,
  titleId,
  lead,
  tone = "default",
  children,
}: MarketingPageProps) {
  const route = MARKETING_ROUTES.find((candidate) => candidate.href === href);
  const index = MARKETING_ROUTES.findIndex((candidate) => candidate.href === href);
  // Wraps, so the last page leads back to the first rather than nowhere.
  const next = MARKETING_ROUTES[(index + 1) % MARKETING_ROUTES.length];

  return (
    <MarketingShell>
      {/*
        A `section`, not a `header`. A second `<header>` on the page is a second
        `banner` landmark to anything that does not implement the nesting rule,
        and a reader navigating by landmark would meet "banner" twice.
      */}
      <section
        className={tone === "dark" ? styles.pageHeaderDark : styles.pageHeader}
        aria-labelledby={titleId}
      >
        <div className={styles.container}>
          <p className={tone === "dark" ? styles.eyebrowInverse : styles.eyebrow}>
            {route?.label ?? ""}
          </p>
          <h1
            className={tone === "dark" ? styles.securityPageTitle : styles.pageTitle}
            id={titleId}
          >
            {title}
          </h1>
          {lead ? (
            <p className={tone === "dark" ? styles.pageLeadInverse : styles.pageLead}>{lead}</p>
          ) : null}
        </div>
      </section>

      {children}

      <nav className={styles.pageOnward} aria-label="Next page">
        <div className={`${styles.container} ${styles.pageOnwardInner}`}>
          <span className={styles.pageOnwardLabel}>Next</span>
          <Link className={styles.pageOnwardLink} href={next.href}>
            {next.label}
            <span className={styles.pageOnwardTitle}>{next.title}</span>
          </Link>
        </div>
      </nav>

      <section className={styles.section} aria-labelledby={`${titleId}-cta`}>
        <div className={`${styles.container} ${styles.closingInner}`}>
          <h2 className={styles.finalTitle} id={`${titleId}-cta`}>
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
      </section>
    </MarketingShell>
  );
}
