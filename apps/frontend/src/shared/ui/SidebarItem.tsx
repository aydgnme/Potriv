import Link from "next/link";

import type { NavigationItem } from "@/shared/config/navigation";

import styles from "./Sidebar.module.css";

export type SidebarItemProps = {
  readonly item: NavigationItem;
  readonly current?: boolean;
};

export function SidebarItem({ item, current = false }: SidebarItemProps) {
  const Icon = item.icon;

  return (
    <li>
      <Link
        href={item.href}
        className={[styles.item, current ? styles.itemCurrent : null]
          .filter(Boolean)
          .join(" ")}
        /* Announced as the current page rather than signalled by styling alone. */
        aria-current={current ? "page" : undefined}
      >
        <Icon className={styles.itemIcon} size={16} aria-hidden="true" />
        <span>{item.label}</span>
      </Link>
    </li>
  );
}
