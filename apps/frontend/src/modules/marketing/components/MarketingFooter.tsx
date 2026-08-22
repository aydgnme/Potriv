import Link from "next/link";

import { MARKETING_ROUTES, SIGN_IN_HREF } from "../landingContent";
import styles from "../styles/landing.module.css";

/**
 * The public footer.
 *
 * Reads `MARKETING_ROUTES` — the same array the header reads — so the two
 * cannot drift. Only links to places that exist: no legal, company or pricing
 * pages are invented to fill the row out.
 */
export function MarketingFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`${styles.container} ${styles.footerInner}`}>
        <p className={styles.footerBrand}>
          <span className={styles.footerWordmark}>POTRIV</span> · Team allocation
          and skill matching
        </p>

        <nav aria-label="Marketing, footer">
          <ul className={styles.footerLinks}>
            {MARKETING_ROUTES.map((route) => (
              <li key={route.href}>
                <Link className={styles.footerLink} href={route.href}>
                  {route.label}
                </Link>
              </li>
            ))}
            <li>
              <Link className={styles.footerLink} href={SIGN_IN_HREF}>
                Sign in
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
