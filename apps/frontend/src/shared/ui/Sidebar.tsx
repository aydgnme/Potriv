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
  readonly organizationName: string;
  readonly user: SidebarUser;
  /** Already composed by getNavigationItems. The sidebar decides nothing. */
  readonly navigationItems: readonly NavigationItem[];
  readonly currentItemId?: NavigationItemId;
};

/**
 * Product navigation.
 *
 * It renders what it is given and contains no role conditions — capability
 * composition belongs to `getNavigationItems`, which is pure and tested. If a
 * role chain ever appears in this file, the rule has been broken.
 *
 * The organization name is context, not a control: every user belongs to exactly
 * one organization and no endpoint changes it, so there is no switcher.
 */
export function Sidebar({
  organizationName,
  user,
  navigationItems,
  currentItemId,
}: SidebarProps) {
  return (
    <nav className={styles.sidebar} aria-label="Product">
      <div className={styles.identity}>
        <span className={styles.wordmark}>Potriv</span>
        <span className={styles.organization}>{organizationName}</span>
      </div>

      <ul className={styles.items}>
        {navigationItems.map((item) => (
          <SidebarItem key={item.id} item={item} current={item.id === currentItemId} />
        ))}
      </ul>

      <div className={styles.account}>
        <span className={styles.accountName}>{user.name}</span>
        <span className={styles.accountRoles}>
          {user.roles.map(roleLabel).join(" · ")}
        </span>
      </div>
    </nav>
  );
}
