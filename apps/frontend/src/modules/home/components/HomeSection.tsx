import Link from "next/link";
import type { ReactNode } from "react";

import styles from "./Home.module.css";

export type HomeSectionProps = {
  readonly title: string;
  /**
   * Always rendered beside its noun — "3 pending staffing reviews", never a
   * bare "3", so the number means something when read aloud.
   */
  readonly summary?: string;
  readonly action?: { readonly label: string; readonly href: string };
  readonly children: ReactNode;
};

/**
 * One Home panel. Home-local on purpose: it encodes this page's layout, not a
 * cross-domain pattern, so it stays out of `shared` until something else
 * genuinely needs it.
 */
export function HomeSection({ title, summary, action, children }: HomeSectionProps) {
  return (
    <section className={styles.section} aria-labelledby={sectionId(title)}>
      <div className={styles.sectionHeader}>
        <div>
          <h2 id={sectionId(title)} className={styles.sectionTitle}>
            {title}
          </h2>
          {summary ? <p className={styles.sectionSummary}>{summary}</p> : null}
        </div>
        {action ? (
          <Link className={styles.sectionAction} href={action.href}>
            {action.label}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function sectionId(title: string): string {
  return `home-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
