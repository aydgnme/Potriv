import Link from "next/link";

import type { NavigationItem } from "@/shared/config/navigation";

import styles from "./Sidebar.module.css";
import { VisuallyHidden } from "./VisuallyHidden";

export type SidebarItemProps = {
  readonly item: NavigationItem;
  readonly current?: boolean;
  /** Hides the label from the eye only — the link keeps its name. */
  readonly collapsed?: boolean;
};

export function SidebarItem({ item, current = false, collapsed = false }: SidebarItemProps) {
  const Icon = item.icon;

  return (
    <li>
      <Link
        href={item.href}
        className={[
          styles.item,
          current ? styles.itemCurrent : null,
          collapsed ? styles.itemCollapsed : null,
        ]
          .filter(Boolean)
          .join(" ")}
        /* Announced as the current page rather than signalled by styling alone. */
        aria-current={current ? "page" : undefined}
      >
        <Icon className={styles.itemIcon} size={16} aria-hidden="true" />
        {collapsed ? (
          <VisuallyHidden>{item.label}</VisuallyHidden>
        ) : (
          /* Classed so the medium-width rail can clip it without dropping the
             link's name — see Sidebar.module.css. */
          <span className={styles.itemLabel}>{item.label}</span>
        )}
      </Link>
    </li>
  );
}
