import Link from "next/link";
import type { ReactNode } from "react";

import { AuthTopology, type AuthTopologyKind } from "./AuthTopology";
import styles from "./PublicAuthShell.module.css";

/**
 * The frame shared by every public auth page.
 *
 * It exists because five routes — sign in, create workspace, forgot password,
 * reset password and join by invite — are the same task shape: a short piece of
 * context and one form. Giving each its own layout is how public auth pages
 * drift apart.
 *
 * A server component with no state: the pages keep their own client boundaries
 * for their forms, so the shell itself never ships to the browser.
 *
 * The context panel is desktop-only and decorative. On mobile it collapses to a
 * single line above the form, because at 390px a topology drawing competes with
 * the thing the visitor is trying to do, and the form wins.
 */

export type PublicAuthShellProps = {
  /** The page's `h1`. */
  readonly title: string;
  /** One or two sentences under the title. */
  readonly intro?: ReactNode;
  /** Heading of the desktop context panel. */
  readonly contextTitle: string;
  /** Body of the desktop context panel, and the mobile one-liner. */
  readonly contextBody: string;
  readonly topology: AuthTopologyKind;
  readonly children: ReactNode;
  /** Secondary links under a separator — "Back to sign in" and similar. */
  readonly footer?: ReactNode;
};

export function PublicAuthShell({
  title,
  intro,
  contextTitle,
  contextBody,
  topology,
  children,
  footer,
}: PublicAuthShellProps) {
  return (
    <div className={styles.page}>
      {/* Decorative context. Hidden below 900px, where the form takes the page. */}
      <aside className={styles.context} aria-hidden="true">
        <span className={styles.wordmark}>POTRIV</span>

        <div className={styles.contextInner}>
          <p className={styles.contextTitle}>{contextTitle}</p>
          <AuthTopology kind={topology} />
          <p className={styles.contextBody}>{contextBody}</p>
        </div>

        {/* Mirrors the real link in the form column; hidden from assistive
            technology with the rest of the panel so it is not announced twice. */}
        <span className={styles.backLink}>Potriv · Team allocation and skill matching</span>
      </aside>

      <main className={styles.main}>
        <div className={styles.panel}>
          <Link className={styles.wordmark} href="/">
            POTRIV
          </Link>

          <h1 className={styles.title}>{title}</h1>
          {intro ? <p className={styles.intro}>{intro}</p> : null}
          <p className={styles.mobileContext}>{contextBody}</p>

          <div className={styles.body}>{children}</div>

          {footer ? <div className={styles.footer}>{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}
