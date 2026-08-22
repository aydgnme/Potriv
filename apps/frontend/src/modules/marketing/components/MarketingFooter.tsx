import Link from "next/link";

import {
  CREATE_WORKSPACE_HREF,
  HOME_HREF,
  MARKETING_ROUTES,
  SIGN_IN_HREF,
} from "../landingContent";
import styles from "../styles/landing.module.css";

/**
 * The public footer.
 *
 * Deliberately not the header again. The two were the same object for a while —
 * a wordmark on the left and the same four links on the right — which made the
 * bottom of every page read as a duplicate of the top and gave a reader who had
 * scrolled all the way down nothing they had not already passed.
 *
 * So the header stays a one-line utility bar and this becomes what a footer is
 * for: the site laid out as columns, with the two account actions given their
 * own group rather than hidden among the pages.
 *
 * The column headings are labels, not destinations. Every link here is a route
 * that exists — `MARKETING_ROUTES` is the same array the header reads, so the
 * two cannot drift — and no legal, company or pricing page is invented to make
 * the columns look fuller.
 */
export function MarketingFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`${styles.container} ${styles.footerInner}`}>
        <div className={styles.footerBrandBlock}>
          <Link className={styles.footerWordmark} href={HOME_HREF}>
            POTRIV
          </Link>
          <p className={styles.footerTagline}>Team allocation and skill matching</p>
        </div>

        <div className={styles.footerColumns}>
          <nav className={styles.footerColumn} aria-label="Marketing, footer">
            <h2 className={styles.footerColumnTitle}>Pages</h2>
            <ul className={styles.footerList}>
              {MARKETING_ROUTES.map((route) => (
                <li key={route.href}>
                  <Link className={styles.footerLink} href={route.href}>
                    {route.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav className={styles.footerColumn} aria-label="Account">
            <h2 className={styles.footerColumnTitle}>Account</h2>
            <ul className={styles.footerList}>
              <li>
                <Link className={styles.footerLink} href={SIGN_IN_HREF}>
                  Sign in
                </Link>
              </li>
              <li>
                <Link className={styles.footerLink} href={CREATE_WORKSPACE_HREF}>
                  Create workspace
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>

      <div className={`${styles.container} ${styles.footerBaseline}`}>
        <p className={styles.footerNote}>
          Potriv · Team allocation and skill matching
        </p>
        {/* Stated because it is true and because a security page that claims no
            certification should not sit above a footer implying otherwise. */}
        <p className={styles.footerNote}>No certifications are claimed.</p>
      </div>
    </footer>
  );
}
