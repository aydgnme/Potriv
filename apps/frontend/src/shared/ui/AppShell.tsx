import type { ReactNode } from "react";

import type { NavigationItemId } from "@/shared/config/navigation";

import styles from "./AppShell.module.css";
import { ProductNavigation } from "./ProductNavigation";
import type { SidebarUser } from "./Sidebar";

export type AppShellProps = {
  /** Omitted when the session cannot supply one — see Sidebar. */
  readonly organizationName?: string | null;
  readonly user: SidebarUser;
  /**
   * The navigation the caller's roles compose, as ids.
   *
   * Ids because the shell's navigation is a client component and an icon
   * component cannot cross that boundary. The composition itself stays where it
   * was: the server decides which ids exist.
   */
  readonly navigationItemIds: readonly NavigationItemId[];
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
 * The current domain is no longer a prop. It is a function of the URL, and
 * asking every page to pass it meant every page could forget — which is how the
 * shell arrived here with `aria-current` supported and never supplied. The
 * navigation resolves it from the pathname instead, once.
 *
 * Mounted by the protected product layout, which resolves the session and passes
 * the real user in.
 */
export function AppShell({
  organizationName,
  user,
  navigationItemIds,
  accountActions,
  children,
}: AppShellProps) {
  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main">
        Skip to content
      </a>
      <ProductNavigation
        organizationName={organizationName}
        user={user}
        itemIds={navigationItemIds}
        accountActions={accountActions}
      />
      <main id="main" className={styles.main} tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
