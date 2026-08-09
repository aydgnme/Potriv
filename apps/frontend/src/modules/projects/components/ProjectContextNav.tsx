import Link from "next/link";

import styles from "./Projects.module.css";

export type ProjectSection = "overview" | "team" | "team-finder";

export type ProjectContextNavProps = {
  readonly projectId: string;
  readonly active: ProjectSection;
  /**
   * Whether this session manages this project. Staffing it is the owner's job,
   * so a reader is not offered a door they cannot walk through.
   */
  readonly canManage?: boolean;
};

const SECTIONS: readonly {
  readonly id: ProjectSection;
  readonly label: string;
  readonly ownerOnly?: boolean;
}[] = [
  { id: "overview", label: "Overview" },
  { id: "team", label: "Team" },
  { id: "team-finder", label: "Find team", ownerOnly: true },
];

/**
 * Moving between a project's sections changes the URL and the data behind it, so
 * these are links in a nav — not tabs.
 *
 * `role="tab"` would promise the whole ARIA tabs model: arrow-key roving focus,
 * panels tied by `aria-controls`, content already loaded. None of that is true of
 * a server round trip, and claiming it leaves a keyboard user pressing arrows at
 * something that never responds.
 */
export function ProjectContextNav({
  projectId,
  active,
  canManage = false,
}: ProjectContextNavProps) {
  const sections = SECTIONS.filter((section) => !section.ownerOnly || canManage);

  return (
    <nav aria-label="Project sections" className={styles.scopeNav}>
      {sections.map((section) => {
        const isActive = section.id === active;
        const href =
          section.id === "overview"
            ? `/projects/${projectId}`
            : `/projects/${projectId}/${section.id}`;

        return (
          <Link
            key={section.id}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={[styles.scopeLink, isActive ? styles.scopeLinkActive : null]
              .filter(Boolean)
              .join(" ")}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
