import type { ReactNode } from "react";

import type { NavigationItem, NavigationItemId } from "@/shared/config/navigation";
import type { AccessRole } from "@/shared/types/accessRole";
import { roleLabel } from "@/shared/types/accessRole";

import styles from "./Sidebar.module.css";
import { SidebarItem } from "./SidebarItem";

export type SidebarUser = {
  readonly name: string;
  readonly roles: readonly AccessRole[];
};

export type SidebarProps = {
  /**
   * Optional because the authenticated session does not carry one. `/auth/me`
   * returns an organization **id** and no name, and the only endpoint that could
   * supply one is organization-admin-only. When it is absent the line is simply
   * not rendered — a UUID or an invented label would be worse than nothing.
   */
  readonly organizationName?: string | null;
  readonly user: SidebarUser;
  /** Already composed by getNavigationItems. The sidebar decides nothing. */
  readonly navigationItems: readonly NavigationItem[];
  readonly currentItemId?: NavigationItemId;
  /**
   * Account controls, supplied by whoever mounts the shell. A slot rather than a
   * dependency: `shared` must never import a product module, and sign-out
   * belongs to the auth domain.
   */
  readonly accountActions?: ReactNode;
};

/**
 * Product navigation.
 *
 * It renders what it is given and contains no role conditions — capability
 * composition belongs to `getNavigationItems`, which is pure and tested. If a
 * role chain ever appears in this file, the rule has been broken.
 *
 * The organization name, when present, is context rather than a control: every
 * user belongs to exactly one organization and no endpoint changes it, so there
 * is no switcher.
 */
export function Sidebar({
  organizationName,
  user,
  navigationItems,
  currentItemId,
  accountActions,
}: SidebarProps) {
  return (
    <nav className={styles.sidebar} aria-label="Product">
      <div className={styles.identity}>
        <span className={styles.wordmark}>Potriv</span>
        {organizationName ? (
          <span className={styles.organization}>{organizationName}</span>
        ) : null}
      </div>

      <ul className={styles.items}>
        {navigationItems.map((item) => (
          <SidebarItem key={item.id} item={item} current={item.id === currentItemId} />
        ))}
      </ul>

      <div className={styles.account}>
        <span className={styles.accountName}>{user.name}</span>
        <span className={styles.accountRoles}>{user.roles.map(roleLabel).join(" · ")}</span>
        {accountActions ? <div className={styles.accountActions}>{accountActions}</div> : null}
      </div>
    </nav>
  );
}
