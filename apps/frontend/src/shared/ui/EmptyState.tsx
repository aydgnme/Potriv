import type { ReactNode } from "react";

import styles from "./EmptyState.module.css";

export type EmptyStateProps = {
  /** What is not here, and — where it matters — what to do about it. */
  readonly title: string;
  readonly description?: ReactNode;
  readonly action?: ReactNode;
};

/**
 * A sentence and, where there is one, a button. No illustration and no mascot:
 * an empty review queue is good news and should read as a plain fact.
 */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <p className={styles.title}>{title}</p>
      {description ? <p className={styles.description}>{description}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
