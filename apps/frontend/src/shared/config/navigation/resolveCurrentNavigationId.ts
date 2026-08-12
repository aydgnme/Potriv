import type { NavigationItem, NavigationItemId } from "./navigationItems";

/**
 * Which top-level domain a path belongs to.
 *
 * Matching is by path **segment**, never by prefix: `startsWith("/project")`
 * would claim `/projects-archive` for Projects, and a navigation item that
 * highlights on an unrelated page is worse than one that highlights on none.
 * A path therefore belongs to an item when it *is* the item's href or sits
 * underneath it — `/projects/{id}/team` is Projects, `/projectsomething` is not.
 *
 * Query strings and fragments never change the answer. `?view=mine` selects a
 * scope inside Projects; it does not leave Projects.
 *
 * Returns undefined for anything the navigation does not cover. Nothing is
 * marked current in that case, which is the honest answer: an internal or
 * unknown route belongs to no domain, and picking the closest one would tell
 * the reader they are somewhere they are not.
 */
export function resolveCurrentNavigationId(
  pathname: string,
  items: readonly NavigationItem[],
): NavigationItemId | undefined {
  const path = normalize(pathname);

  let best: NavigationItem | undefined;
  for (const item of items) {
    const href = normalize(item.href);
    if (path !== href && !path.startsWith(`${href}/`)) continue;
    // Longest wins, so a future nested item beats the parent it sits under.
    if (!best || href.length > normalize(best.href).length) best = item;
  }

  return best?.id;
}

/** `usePathname` already excludes them; this holds if it is ever called by hand. */
function normalize(value: string): string {
  const withoutQuery = value.split(/[?#]/, 1)[0] ?? "";
  // A trailing slash is the same place: `/projects/` must not miss `/projects`.
  return withoutQuery.length > 1 ? withoutQuery.replace(/\/+$/, "") : withoutQuery;
}
