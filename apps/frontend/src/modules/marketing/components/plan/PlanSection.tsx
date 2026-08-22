import type { ReactNode } from "react";

import styles from "../../styles/plan.module.css";

/**
 * A numbered part of a chapter.
 *
 * The number is a reading aid, not decoration: these pages are arguments made
 * in order, and a reader scanning for the part about ownership should be able
 * to find it by position.
 */
export function PlanSection({
  index,
  title,
  titleId,
  lead,
  tone = "default",
  children,
}: {
  readonly index: string;
  readonly title: string;
  readonly titleId: string;
  readonly lead?: ReactNode;
  readonly tone?: "default" | "dark";
  readonly children: ReactNode;
}) {
  const dark = tone === "dark";
  return (
    <section className={dark ? styles.sectionDark : styles.section} aria-labelledby={titleId}>
      <div className={styles.container}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionIndex} aria-hidden="true">
            {index}
          </span>
          <div>
            <h2 className={dark ? styles.sectionTitleDark : styles.sectionTitle} id={titleId}>
              {title}
            </h2>
            {lead ? (
              <p className={dark ? styles.sectionLeadDark : styles.sectionLead}>{lead}</p>
            ) : null}
          </div>
        </div>
        {children}
      </div>
    </section>
  );
}
