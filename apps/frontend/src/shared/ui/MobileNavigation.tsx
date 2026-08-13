"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Ellipsis, UserRound } from "lucide-react";

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

        {/* Always present. The sidebar that carries the account block is not
            rendered at this width, so this control is the only route to it —
            dropping it when every domain happened to fit is how sign-out went
            missing for every role set below six domains. */}
        <li className={styles.tab}>
          <AccountSheet
            user={user}
            overflow={overflow}
            currentItemId={currentItemId}
            currentSectionLabel={currentInOverflow?.label}
            accountActions={accountActions}
          />
        </li>
      </ul>
    </nav>
  );
}

/**
 * The account surface, and the overflow one when there is overflow.
 *
 * It always carries the account block — a name, a role list and sign-out — which
 * has nowhere else to live at this width. When domains overflow it carries those
 * too, and is named "More" rather than "Account" so the control says what it
 * actually holds.
 *
 * A native `<dialog>` opened modally, so focus entry, Escape, background
 * inertness and focus return to the trigger are the platform's behaviour rather
 * than a hand-rolled trap. `aria-expanded` on the trigger describes the sheet;
 * `aria-current` stays on the real link inside it, because a button that is not
 * the page cannot claim to be the page.
 */
function AccountSheet({
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
  const titleId = "mobile-account-sheet-title";
  const hasOverflow = overflow.length > 0;
  const label = hasOverflow ? "More" : "Account";

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
        {hasOverflow ? (
          <Ellipsis className={styles.icon} size={18} aria-hidden="true" />
        ) : (
          <UserRound className={styles.icon} size={18} aria-hidden="true" />
        )}
        <span className={styles.label}>{label}</span>
      </button>

      <dialog ref={dialogRef} className={styles.sheet} aria-labelledby={titleId}>
        <h2 className={styles.sheetTitle} id={titleId}>
          {label}
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
