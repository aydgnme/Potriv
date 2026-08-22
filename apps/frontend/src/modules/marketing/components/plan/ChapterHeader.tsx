import type { ReactNode } from "react";

import { chapterFor } from "../../businessPlan";
import styles from "../../styles/plan.module.css";

/**
 * The opening of a chapter.
 *
 * Numbered, because the four pages are a sequence a reader can be part-way
 * through, and a page that only says "Product" gives no sense of that. The
 * decision question is printed under the title: it is what the reader arrived
 * with, and stating it is how the page admits what it is for.
 */
export function ChapterHeader({
  href,
  title,
  titleId,
  lead,
  tone = "default",
  children,
}: {
  readonly href: string;
  readonly title: string;
  readonly titleId: string;
  readonly lead?: ReactNode;
  readonly tone?: "default" | "dark";
  readonly children?: ReactNode;
}) {
  const chapter = chapterFor(href);
  const dark = tone === "dark";

  return (
    <section
      className={dark ? styles.chapterHeadDark : styles.chapterHead}
      aria-labelledby={titleId}
    >
      <div className={styles.container}>
        <p className={styles.chapterMark}>
          <span className={styles.chapterNumber}>{chapter?.number}</span>
          <span className={styles.chapterLabel}>{chapter?.label}</span>
        </p>
        <h1 className={dark ? styles.chapterTitleDark : styles.chapterTitle} id={titleId}>
          {title}
        </h1>
        {chapter ? (
          <p className={dark ? styles.chapterQuestionDark : styles.chapterQuestion}>
            {chapter.question}
          </p>
        ) : null}
        {lead ? (
          <p className={dark ? styles.chapterLeadDark : styles.chapterLead}>{lead}</p>
        ) : null}
        {children}
      </div>
    </section>
  );
}
