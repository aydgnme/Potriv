import Link from "next/link";

import { StatusBadge } from "@/shared/ui/StatusBadge";
import { projectStatusLabel, projectStatusTone } from "@/shared/utils/projectStatus";

import type { DepartmentProjects } from "../model/homeData";
import type { Loaded } from "../server/homeDataSources";

import { HomeSection } from "./HomeSection";
import { SectionError } from "./SectionError";
import styles from "./Home.module.css";

export type DepartmentProjectsSummaryProps = {
  readonly data: Loaded<DepartmentProjects>;
  readonly limit: number;
};

/**
 * What this manager's department is committed to.
 *
 * Titled "Department projects" deliberately — the endpoint is department-scoped
 * and calling it anything organization-wide would misrepresent what it covers.
 * No capacity figure: nothing here reports a member's total load, and summing
 * these rows would silently miss work in other departments.
 */
export function DepartmentProjectsSummary({ data, limit }: DepartmentProjectsSummaryProps) {
  if (!data.ok) {
    return (
      <HomeSection title="Department projects">
        {data.reason === "FORBIDDEN" ? (
          <p className={styles.empty}>
            You are not managing a department yet.
          </p>
        ) : (
          <SectionError>Could not load department projects.</SectionError>
        )}
      </HomeSection>
    );
  }

  const projects = data.value.projects.slice(0, limit);

  return (
    <HomeSection
      title="Department projects"
      summary={data.value.department.name}
      action={{ label: "View department projects", href: "/projects" }}
    >
      {projects.length === 0 ? (
        <p className={styles.empty}>No projects involve this department yet.</p>
      ) : (
        <ul className={styles.rows}>
          {projects.map((project) => (
            <li key={project.projectId} className={styles.row}>
              <div className={styles.rowMain}>
                <Link className={styles.rowTitle} href={`/projects/${project.projectId}`}>
                  {project.projectName}
                </Link>
                <span className={styles.rowMeta}>{peopleFrom(project.teamMembers.length)}</span>
              </div>
              <div className={styles.rowAside}>
                <StatusBadge
                  label={projectStatusLabel(project.status)}
                  tone={projectStatusTone(project.status)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </HomeSection>
  );
}

function peopleFrom(count: number): string {
  return count === 1
    ? "1 person from your department"
    : `${count} people from your department`;
}
