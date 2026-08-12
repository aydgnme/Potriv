"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Ellipsis } from "lucide-react";

import {
  splitMobileNavigation,
  type NavigationItem,
  type NavigationItemId,
} from "@/shared/config/navigation";
import { roleLabel } from "@/shared/types/accessRole";

import styles from "./MobileNavigation.module.css";
import type { SidebarUser } from "./Sidebar";

export type MobileNavigationProps = {
  readonly user: SidebarUser;
  readonly navigationItems: readonly NavigationItem[];
  readonly currentItemId?: NavigationItemId;
  readonly accountActions?: ReactNode;
};

/**
 * Navigation at phone width.
 *
 * A bottom bar rather than the top strip it replaces: six domains, a name, a
 * role list and a sign-out control did not fit across a phone, and the previous
 * answer was to let them scroll sideways — which hides navigation behind a
 * gesture with nothing on screen to suggest it exists.
 *
 * At most five controls. A user with six domains gets four of them plus More,
 * and the sixth is inside More rather than lost. The split is computed from the
 * same composed list the sidebar uses, so mobile can never show a domain the
 * role set did not grant, and never miss one it did.
 */
export function MobileNavigation({
  user,
  navigationItems,
  currentItemId,
  accountActions,
}: MobileNavigationProps) {
  const { tabs, overflow } = splitMobileNavigation(navigationItems);
  const currentInOverflow = overflow.find((item) => item.id === currentItemId);

  return (
    <nav className={styles.bar} aria-label="Product">
      <ul className={styles.tabs}>
        {tabs.map((item) => {
          const Icon = item.icon;
          const current = item.id === currentItemId;

          return (
            <li key={item.id} className={styles.tab}>
              <Link
                href={item.href}
                className={[styles.link, current ? styles.linkCurrent : null]
                  .filter(Boolean)
                  .join(" ")}
                aria-current={current ? "page" : undefined}
              >
                <Icon className={styles.icon} size={18} aria-hidden="true" />
                {/* Labelled, never icon-only: an icon is a reminder, not a name. */}
                <span className={styles.label}>{item.label}</span>
              </Link>
            </li>
          );
        })}

        {overflow.length > 0 ? (
          <li className={styles.tab}>
            <MoreSheet
              user={user}
              overflow={overflow}
              currentItemId={currentItemId}
              currentSectionLabel={currentInOverflow?.label}
              accountActions={accountActions}
            />
          </li>
        ) : null}
      </ul>
    </nav>
  );
}

/**
 * The overflow surface.
 *
 * It carries the domains that did not fit *and* the account block, which is the
 * better home for a name, a role list and sign-out than a bar with five things
 * already in it.
 *
 * A native `<dialog>` opened modally, so focus entry, Escape, background
 * inertness and focus return to the trigger are the platform's behaviour rather
 * than a hand-rolled trap. `aria-expanded` on the trigger describes the sheet;
 * `aria-current` stays on the real link inside it, because a button that is not
 * the page cannot claim to be the page.
 */
function MoreSheet({
  user,
  overflow,
  currentItemId,
  currentSectionLabel,
  accountActions,
}: {
  readonly user: SidebarUser;
  readonly overflow: readonly NavigationItem[];
  readonly currentItemId?: NavigationItemId;
  readonly currentSectionLabel?: string;
  readonly accountActions?: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = "mobile-more-title";

  // `open` mirrors the element rather than driving it, so Escape — which the
  // platform handles without telling React — cannot leave the two disagreeing.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const sync = () => setOpen(dialog.open);
    dialog.addEventListener("close", sync);
    return () => dialog.removeEventListener("close", sync);
  }, []);

  return (
    <>
      <button
        type="button"
        className={[styles.link, currentSectionLabel ? styles.linkCurrentSection : null]
          .filter(Boolean)
          .join(" ")}
        aria-expanded={open}
        aria-haspopup="dialog"
        // Says where the reader is when the current domain lives in here.
        aria-label={
          currentSectionLabel ? `More, current section ${currentSectionLabel}` : undefined
        }
        onClick={() => {
          dialogRef.current?.showModal();
          setOpen(true);
        }}
      >
        <Ellipsis className={styles.icon} size={18} aria-hidden="true" />
        <span className={styles.label}>More</span>
      </button>

      <dialog ref={dialogRef} className={styles.sheet} aria-labelledby={titleId}>
        <h2 className={styles.sheetTitle} id={titleId}>
          More
        </h2>

        <ul className={styles.sheetItems}>
          {overflow.map((item) => {
            const Icon = item.icon;
            const current = item.id === currentItemId;

            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className={[styles.sheetLink, current ? styles.sheetLinkCurrent : null]
                    .filter(Boolean)
                    .join(" ")}
                  aria-current={current ? "page" : undefined}
                  onClick={() => dialogRef.current?.close()}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className={styles.sheetAccount}>
          <span className={styles.accountName}>{user.name}</span>
          <span className={styles.accountRoles}>{user.roles.map(roleLabel).join(" · ")}</span>
          {accountActions}
        </div>

        <button
          type="button"
          className={styles.sheetClose}
          onClick={() => dialogRef.current?.close()}
        >
          Close
        </button>
      </dialog>
    </>
  );
}
