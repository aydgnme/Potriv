import type { ReactNode } from "react";

import type { NavigationItem, NavigationItemId } from "@/shared/config/navigation";

import styles from "./AppShell.module.css";
import { Sidebar, type SidebarUser } from "./Sidebar";

export type AppShellProps = {
  readonly organizationName: string;
  readonly user: SidebarUser;
  readonly navigationItems: readonly NavigationItem[];
  readonly currentItemId?: NavigationItemId;
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
 * Not yet mounted by any route: there is no authenticated screen until FE-02
 * supplies a session. It is built and tested now so that task wires it up rather
 * than designing it.
 */
export function AppShell({
  organizationName,
  user,
  navigationItems,
  currentItemId,
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
      />
      <main id="main" className={styles.main}>
        {children}
      </main>
    </div>
  );
}
