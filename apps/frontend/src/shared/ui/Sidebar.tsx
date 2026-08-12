import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { ReactNode } from "react";

import type { NavigationItem, NavigationItemId } from "@/shared/config/navigation";
import type { AccessRole } from "@/shared/types/accessRole";
import { roleLabel } from "@/shared/types/accessRole";

import styles from "./Sidebar.module.css";
import { SidebarItem } from "./SidebarItem";
import { VisuallyHidden } from "./VisuallyHidden";

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
  /** Narrows to an icon rail. Labels stay in the accessibility tree. */
  readonly collapsed?: boolean;
  /** Absent when there is nobody to tell — the control is then not rendered. */
  readonly onToggleCollapse?: () => void;
};

/**
 * Product navigation on desktop.
 *
 * It renders what it is given and contains no role conditions — capability
 * composition belongs to `getNavigationItems`, which is pure and tested. If a
 * role chain ever appears in this file, the rule has been broken.
 *
 * Collapsing narrows the rail to icons. The labels are still there, hidden from
 * the eye rather than from the accessibility tree, so a collapsed link is named
 * exactly as it was — this is a density preference, not a reduction in what the
 * navigation says. Everything reachable expanded stays reachable collapsed,
 * sign-out included, because a preference must not cost a capability.
 *
 * The preference only exists where there is room for it to mean something.
 * Between 768px and 1100px the rail is what the layout gives you either way, so
 * the stylesheet hides this control rather than letting it claim an expanded
 * navigation and then change nothing when pressed.
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
  collapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <nav
      className={[styles.sidebar, collapsed ? styles.sidebarCollapsed : null]
        .filter(Boolean)
        .join(" ")}
      aria-label="Product"
    >
      <div className={styles.identity}>
        {/* The mark alone when collapsed; the full name is still announced. */}
        <span className={styles.wordmark} aria-hidden={collapsed ? "true" : undefined}>
          {collapsed ? "P" : "Potriv"}
        </span>
        {collapsed ? <VisuallyHidden>Potriv</VisuallyHidden> : null}
        {organizationName && !collapsed ? (
          <span className={styles.organization}>{organizationName}</span>
        ) : null}
      </div>

      <ul className={styles.items}>
        {navigationItems.map((item) => (
          <SidebarItem
            key={item.id}
            item={item}
            current={item.id === currentItemId}
            collapsed={collapsed}
          />
        ))}
      </ul>

      <div className={styles.account}>
        {/* Compacted, not dropped: who you are signed in as stays announced. */}
        {collapsed ? (
          <VisuallyHidden>
            {`${user.name}. ${user.roles.map(roleLabel).join(", ")}`}
          </VisuallyHidden>
        ) : (
          <>
            <span className={styles.accountName}>{user.name}</span>
            <span className={styles.accountRoles}>
              {user.roles.map(roleLabel).join(" · ")}
            </span>
          </>
        )}
        {accountActions ? <div className={styles.accountActions}>{accountActions}</div> : null}

        {onToggleCollapse ? (
          <button
            type="button"
            className={styles.collapseToggle}
            /* Describes the navigation region this control governs. */
            aria-expanded={!collapsed}
            onClick={onToggleCollapse}
          >
            <ToggleIcon className={styles.itemIcon} size={16} aria-hidden="true" />
            {collapsed ? (
              <VisuallyHidden>Expand navigation</VisuallyHidden>
            ) : (
              <span className={styles.toggleLabel}>Collapse navigation</span>
            )}
          </button>
        ) : null}
      </div>
    </nav>
  );
}
