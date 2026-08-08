import type { ReactNode } from "react";

import styles from "./PageHeader.module.css";

export type PageHeaderProps = {
  /** The object's name where there is one, not the domain name. */
  readonly title: string;
  readonly description?: ReactNode;
  /** Status badges sit beside the title, not below it. */
  readonly status?: ReactNode;
  /** One primary action. Destructive actions never belong here. */
  readonly actions?: ReactNode;
};

export function PageHeader({ title, description, status, actions }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.headline}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{title}</h1>
          {status}
        </div>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
