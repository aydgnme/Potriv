import { NAVIGATION_DEFINITIONS, type NavigationItem, type NavigationItemId } from "./navigationItems";

/**
 * The most controls a bottom bar may carry.
 *
 * Five is the discovery limit, and it is a limit on *controls*, not on domains:
 * a sixth domain does not get a sixth cramped tab, it moves behind one More
 * control that is itself the fifth.
 */
export const MAX_BOTTOM_CONTROLS = 5;

export type MobileNavigation = {
  /** Rendered directly in the bar, in source order. */
  readonly tabs: readonly NavigationItem[];
  /** Rendered inside the More sheet. Empty when everything fits. */
  readonly overflow: readonly NavigationItem[];
};

/**
 * How a role's navigation fits into a bottom bar.
 *
 * Pure, and deliberately unaware of roles: it receives whatever
 * `getNavigationItems` already composed, so a capability decision is never taken
 * twice in two places that could disagree. Source order is preserved, so the
 * bar reads in the same order as the sidebar.
 *
 * Nothing is ever dropped — an item that does not fit is in `overflow`, and the
 * caller is expected to render it.
 */
export function splitMobileNavigation(
  items: readonly NavigationItem[],
): MobileNavigation {
  if (items.length <= MAX_BOTTOM_CONTROLS) return { tabs: items, overflow: [] };

  // One slot goes to More itself, so the remaining domains stay reachable.
  const direct = MAX_BOTTOM_CONTROLS - 1;
  return { tabs: items.slice(0, direct), overflow: items.slice(direct) };
}

/**
 * Rebuilds items from ids against the one definition list.
 *
 * The client navigation boundary cannot receive the items themselves — each
 * carries an icon *component*, which does not cross the server/client boundary —
 * so it receives the ids the server composed and looks them up here. That keeps
 * one definition list and one role decision: this function can only return items
 * the server already granted, and adding an id it was not given is impossible.
 */
export function navigationItemsFor(
  ids: readonly NavigationItemId[],
): readonly NavigationItem[] {
  const granted = new Set(ids);

  return NAVIGATION_DEFINITIONS.filter((item) => granted.has(item.id)).map(
    ({ id, label, href, icon }) => ({ id, label, href, icon }),
  );
}
