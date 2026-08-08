import type { ReactNode } from "react";

import type { NavigationItem, NavigationItemId } from "@/shared/config/navigation";

import styles from "./AppShell.module.css";
import { Sidebar, type SidebarUser } from "./Sidebar";

export type AppShellProps = {
  /** Omitted when the session cannot supply one — see Sidebar. */
  readonly organizationName?: string | null;
  readonly user: SidebarUser;
  readonly navigationItems: readonly NavigationItem[];
  readonly currentItemId?: NavigationItemId;
  /** Account controls supplied by the caller; the shell stays domain-agnostic. */
  readonly accountActions?: ReactNode;
  readonly children: ReactNode;
};

/**
 * The product frame: navigation beside content.
 *
 * It takes everything as props and **fetches nothing**. That keeps it renderable
 * in a test with no session, no network and no mocking, and it means the
 * decision about where the current user comes from belongs to the route rather
 * than being buried in the layout.
 *
 * Mounted by the protected product layout, which resolves the session and passes
 * the real user in.
 */
export function AppShell({
  organizationName,
  user,
  navigationItems,
  currentItemId,
  accountActions,
  children,
}: AppShellProps) {
  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main">
        Skip to content
      </a>
      <Sidebar
        organizationName={organizationName}
        user={user}
        navigationItems={navigationItems}
        currentItemId={currentItemId}
        accountActions={accountActions}
      />
      <main id="main" className={styles.main}>
        {children}
      </main>
    </div>
  );
}
