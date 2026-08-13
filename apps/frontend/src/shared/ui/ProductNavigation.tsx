"use client";

import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import {
  navigationItemsFor,
  resolveCurrentNavigationId,
  type NavigationItemId,
} from "@/shared/config/navigation";

import { MobileNavigation } from "./MobileNavigation";
import { Sidebar, type SidebarUser } from "./Sidebar";

export type ProductNavigationProps = {
  readonly organizationName?: string | null;
  readonly user: SidebarUser;
  /**
   * Ids the server composed from the real role set.
   *
   * Ids rather than items because each item carries an icon *component*, which
   * cannot cross the server/client boundary. The role decision stays on the
   * server: this component can only render what it was handed.
   */
  readonly itemIds: readonly NavigationItemId[];
  readonly accountActions?: ReactNode;
};

/**
 * The navigation surfaces, and the only part of the shell that is a client
 * component.
 *
 * It exists because the current domain is a function of the URL, and a server
 * layout cannot read the URL without digging through request headers — guessing
 * at a framework internal to render a highlight. `usePathname` is the supported
 * answer, and it costs exactly this boundary.
 *
 * No token, no session and no authority reach it. It receives a display name,
 * role labels already shown on screen, and the navigation ids the server chose;
 * every one of those is already visible in the rendered page.
 */
export function ProductNavigation({
  organizationName,
  user,
  itemIds,
  accountActions,
}: ProductNavigationProps) {
  const pathname = usePathname();
  const items = navigationItemsFor(itemIds);
  const currentItemId = resolveCurrentNavigationId(pathname ?? "", items);

  // Not persisted. A preference that survives reloads is a small convenience
  // with a storage question attached; the collapse is one keystroke away.
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      <Sidebar
        organizationName={organizationName}
        user={user}
        navigationItems={items}
        currentItemId={currentItemId}
        accountActions={accountActions}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((value) => !value)}
      />
      <MobileNavigation
        user={user}
        navigationItems={items}
        currentItemId={currentItemId}
        accountActions={accountActions}
      />
    </>
  );
}
