import Link from "next/link";

import { PROJECT_STATUSES } from "@/shared/types/projectStatus";
import { projectStatusLabel } from "@/shared/utils/projectStatus";

import type { ProjectStatusFilter as StatusFilter, ProjectsQuery } from "../model/projectsQuery";
import { projectsHref } from "../model/projectsQuery";

import styles from "./Projects.module.css";

export type ProjectStatusFilterProps = {
  readonly query: ProjectsQuery;
};

const OPTIONS: readonly { readonly status: StatusFilter; readonly label: string }[] = [
  { status: null, label: "All statuses" },
  ...PROJECT_STATUSES.map((status) => ({ status, label: projectStatusLabel(status) })),
];

/**
 * The status filter, as links that change the URL.
 *
 * No client state library and no `onChange` that fires a request: the filter is
 * part of the address, so it survives a reload, can be shared, and works before
 * any JavaScript has run.
 *
 * The current scope is carried across every option — narrowing by status should
 * not silently move someone to a different view. The active option is named in
 * text through `aria-current`, never by colour alone.
 */
export function ProjectStatusFilter({ query }: ProjectStatusFilterProps) {
  return (
    <nav aria-label="Filter projects by status" className={styles.statusFilter}>
      {OPTIONS.map((option) => {
        const active = option.status === query.status;

        return (
          <Link
            key={option.status ?? "all"}
            href={projectsHref({ ...query, status: option.status })}
            aria-current={active ? "true" : undefined}
            className={[styles.filterLink, active ? styles.filterLinkActive : null]
              .filter(Boolean)
              .join(" ")}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
