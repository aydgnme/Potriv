import type { AccessRole } from "@/shared/types/accessRole";

import { NAVIGATION_DEFINITIONS, type NavigationItem } from "./navigationItems";

/**
 * Composes the navigation from the union of a user's roles.
 *
 * Pure and total: same roles in, same items out, no ordering surprises. There is
 * no active-role concept anywhere — the backend authorises against the whole
 * role set, so a UI-level role switcher would constrain nothing while appearing
 * to. Holding more roles can only reveal more items, never fewer.
 *
 * Roles the product does not model — `SYSTEM_ADMIN` above all — cannot reach
 * this function: `AccessRole` excludes them and `toProductRoles` drops them at
 * the boundary. They contribute nothing by construction rather than by a filter
 * someone could forget to apply.
 */
export function getNavigationItems(roles: readonly AccessRole[]): readonly NavigationItem[] {
  const held = new Set<AccessRole>(roles);

  return NAVIGATION_DEFINITIONS.filter(
    (item) => item.revealedBy.length === 0 || item.revealedBy.some((role) => held.has(role)),
  ).map(({ id, label, href, icon }) => ({ id, label, href, icon }));
}
