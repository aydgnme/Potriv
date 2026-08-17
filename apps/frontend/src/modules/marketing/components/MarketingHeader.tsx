"use client";

import Link from "next/link";
import { useState } from "react";

import { LANDING_SECTIONS, SIGN_IN_HREF, CREATE_WORKSPACE_HREF } from "../landingContent";
import styles from "./MarketingHeader.module.css";

/**
 * The public header.
 *
 * The only client component on the landing page, and only because the mobile
 * menu is genuine state. Everything else — hero, diagrams, all seven sections —
 * is server-rendered.
 *
 * The menu holds no focus trap and no scroll lock on purpose: it is an inline
 * block that pushes the page down rather than an overlay, so the page behind it
 * is not obscured and there is nothing to trap focus away from. Closed means
 * unmounted, so a hidden link can never be reached by Tab.
 */
export function MarketingHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <a className={styles.wordmark} href="#main">
          POTRIV
        </a>

        <nav className={styles.nav} aria-label="Landing sections">
          {LANDING_SECTIONS.map((section) => (
            <a key={section.id} className={styles.navLink} href={`#${section.id}`}>
              {section.label}
            </a>
          ))}
        </nav>

        <div className={styles.actions}>
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
            aria-controls="landing-menu"
            onClick={() => setOpen((wasOpen) => !wasOpen)}
          >
            {/* The control's name comes from here, not from the glyph. */}
            <span className="p-visually-hidden">{open ? "Close menu" : "Open menu"}</span>
            <MenuGlyph open={open} />
          </button>
        </div>
      </div>

      {open ? (
        <div className={styles.panel} id="landing-menu">
          <ul className={styles.panelList}>
            {LANDING_SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  className={styles.panelLink}
                  href={`#${section.id}`}
                  onClick={() => setOpen(false)}
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
          <Link className={styles.panelCreate} href={CREATE_WORKSPACE_HREF}>
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
