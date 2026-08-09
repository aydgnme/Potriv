import Link from "next/link";

import { StatusBadge } from "@/shared/ui/StatusBadge";
import { formatDate } from "@/shared/utils/formatDate";
import { projectStatusLabel, projectStatusTone } from "@/shared/utils/projectStatus";

import type { MyProjects } from "../model/homeData";
import type { Loaded } from "../server/homeDataSources";

import { HomeSection } from "./HomeSection";
import { SectionError } from "./SectionError";
import styles from "./Home.module.css";

export type MyCurrentWorkProps = {
  readonly data: Loaded<MyProjects>;
  readonly limit: number;
};

/**
 * What the signed-in user is working on. Shown to everyone, once, whatever else
 * they also are.
 */
export function MyCurrentWork({ data, limit }: MyCurrentWorkProps) {
  if (!data.ok) {
    return (
      <HomeSection title="My current work">
        <SectionError>Could not load your projects.</SectionError>
      </HomeSection>
    );
  }

  const current = data.value.currentProjects.slice(0, limit);

  return (
    <HomeSection
      title="My current work"
      summary={summaryFor(data.value.currentProjects.length)}
      action={{ label: "View projects", href: "/projects" }}
    >
      {current.length === 0 ? (
        <p className={styles.empty}>
          No active project work. Your assignments will appear here once they
          begin.
        </p>
      ) : (
        <ul className={styles.rows}>
          {current.map((project) => (
            <li key={project.projectId} className={styles.row}>
              <div className={styles.rowMain}>
                <Link className={styles.rowTitle} href={`/projects/${project.projectId}`}>
                  {project.projectName}
                </Link>
                <span className={styles.rowMeta}>
                  {project.roles.map((role) => role.name).join(", ") || "No role recorded"}
                  {" · "}
                  {project.workHoursPerDay} h/day
                  {project.deadlineDate ? ` · ends ${formatDate(project.deadlineDate)}` : ""}
                </span>
              </div>
              <div className={styles.rowAside}>
                <StatusBadge
                  label={projectStatusLabel(project.projectStatus)}
                  tone={projectStatusTone(project.projectStatus)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </HomeSection>
  );
}

function summaryFor(count: number): string | undefined {
  if (count === 0) return undefined;
  return count === 1 ? "1 active project" : `${count} active projects`;
}
