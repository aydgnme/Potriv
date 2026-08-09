import Link from "next/link";

import type { ProjectsQuery, ProjectsScope } from "../model/projectsQuery";
import { projectsHref } from "../model/projectsQuery";

import styles from "./Projects.module.css";

export type ProjectsScopeNavProps = {
  readonly scopes: readonly ProjectsScope[];
  readonly query: ProjectsQuery;
};

/**
 * Choosing a scope changes the URL and the data behind it, so these are links in
 * a nav — not tabs.
 *
 * They may look tab-like, but `role="tab"` promises the whole ARIA tabs
 * interaction model: arrow-key roving focus, panels tied by `aria-controls`,
 * content that is already loaded. None of that is true of a server round trip,
 * and claiming it would leave a keyboard user pressing arrows at something that
 * never responds.
 *
 * With one granted scope there is nothing to navigate between, so the nav is
 * omitted rather than rendered as a single dead control.
 */
export function ProjectsScopeNav({ scopes, query }: ProjectsScopeNavProps) {
  if (scopes.length < 2) return null;

  return (
    <nav aria-label="Project views" className={styles.scopeNav}>
      {scopes.map((scope) => {
        const active = scope.view === query.view;

        return (
          <Link
            key={scope.view}
            href={projectsHref({ ...query, view: scope.view })}
            aria-current={active ? "page" : undefined}
            className={[styles.scopeLink, active ? styles.scopeLinkActive : null]
              .filter(Boolean)
              .join(" ")}
          >
            {scope.label}
          </Link>
        );
      })}
    </nav>
  );
}
