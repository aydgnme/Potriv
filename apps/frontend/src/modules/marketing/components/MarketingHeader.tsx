"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import {
  CREATE_WORKSPACE_HREF,
  HOME_HREF,
  MARKETING_ROUTES,
  SIGN_IN_HREF,
} from "../landingContent";
import styles from "./MarketingHeader.module.css";

/**
 * The public header.
 *
 * The only client component on the marketing pages, and only because the mobile
 * menu is genuine state and `aria-current` needs the current path. Everything
 * else — heroes, diagrams, every section — is server-rendered.
 *
 * The four destinations used to be `#fragment` links into one long page, which
 * meant the header advertised four pages that did not exist. They are routes
 * now, so these are ordinary `Link`s and the matching one can honestly say
 * `aria-current="page"`.
 *
 * The menu holds no focus trap and no scroll lock on purpose: it is an inline
 * block that pushes the page down rather than an overlay, so the page behind it
 * is not obscured and there is nothing to trap focus away from. Closed means
 * unmounted, so a hidden link can never be reached by Tab.
 *
 * This stays a one-line utility bar on purpose. The footer used to repeat it
 * exactly — same wordmark, same four links — so the bottom of every page was a
 * copy of the top. The footer is columns now; this is the control strip, and the
 * two no longer look like the same component twice.
 */
export function MarketingHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  /*
    Exact match only. `/` is not "current" for any of the four, and a prefix
    match would mark Product current on a future `/product-something`.
  */
  const currentHref = MARKETING_ROUTES.find((route) => route.href === pathname)?.href;

  return (
    <header className={styles.header}>
      <a className={styles.skipLink} href="#main">
        Skip to content
      </a>

      <div className={styles.inner}>
        {/* The wordmark is a link home, not a jump to `#main`. The skip link
            above is what serves people who want to bypass the navigation. */}
        <Link className={styles.wordmark} href={HOME_HREF}>
          POTRIV
        </Link>

        <nav className={styles.nav} aria-label="Marketing">
          {MARKETING_ROUTES.map((route) => (
            <Link
              key={route.href}
              className={styles.navLink}
              href={route.href}
              aria-current={route.href === currentHref ? "page" : undefined}
            >
              {route.label}
            </Link>
          ))}
        </nav>

        <div className={styles.actions}>
          {/* A rule, so the account actions read as a separate group from the
              pages rather than as two more links in the same list. */}
          <span className={styles.actionsDivider} aria-hidden="true" />
          <Link className={styles.signIn} href={SIGN_IN_HREF}>
            Sign in
          </Link>
          <Link className={styles.create} href={CREATE_WORKSPACE_HREF}>
            Create workspace
          </Link>
          <button
            type="button"
            className={styles.menuButton}
            aria-expanded={open}
            aria-controls="marketing-menu"
            onClick={() => setOpen((wasOpen) => !wasOpen)}
          >
            {/* The control's name comes from here, not from the glyph. */}
            <span className="p-visually-hidden">{open ? "Close menu" : "Open menu"}</span>
            <MenuGlyph open={open} />
          </button>
        </div>
      </div>

      {open ? (
        <div className={styles.panel} id="marketing-menu">
          <nav aria-label="Marketing, mobile">
            <ul className={styles.panelList}>
              {MARKETING_ROUTES.map((route) => (
                <li key={route.href}>
                  <Link
                    className={styles.panelLink}
                    href={route.href}
                    aria-current={route.href === currentHref ? "page" : undefined}
                    onClick={() => setOpen(false)}
                  >
                    {route.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <Link
            className={styles.panelCreate}
            href={CREATE_WORKSPACE_HREF}
            onClick={() => setOpen(false)}
          >
            Create workspace
          </Link>
        </div>
      ) : null}
    </header>
  );
}

function MenuGlyph({ open }: { open: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      {open ? (
        <path
          d="M3 3l12 12M15 3L3 15"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M2 5h14M2 9h14M2 13h14"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
