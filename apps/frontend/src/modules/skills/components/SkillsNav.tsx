import Link from "next/link";

import styles from "./Skills.module.css";

export type SkillsView = "catalogue" | "mine";

/**
 * The two Skills views.
 *
 * Ordinary links rather than ARIA tabs: each is a page with its own URL, and
 * claiming the tab role would promise arrow-key semantics this does not
 * implement. Both are visible to everybody — the catalogue is shared vocabulary,
 * and the profile is the reader's own.
 */
export function SkillsNav({ active }: { readonly active: SkillsView }) {
  return (
    <nav className={styles.viewNav} aria-label="Skills views">
      <Link
        href="/skills"
        className={styles.viewLink}
        aria-current={active === "catalogue" ? "page" : undefined}
      >
        Catalogue
      </Link>
      <Link
        href="/skills/my"
        className={styles.viewLink}
        aria-current={active === "mine" ? "page" : undefined}
      >
        My skills
      </Link>
    </nav>
  );
}
