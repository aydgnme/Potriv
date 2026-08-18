import Link from "next/link";

import { Breadcrumbs } from "@/shared/ui/Breadcrumbs";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";

import type { TeamRoleCatalogueEntry } from "../model/projectDetail";
import { createProjectAction } from "../server/actions/projectActions";
import type { Loaded } from "../server/projectsDataSources";

import { ProjectForm } from "./ProjectForm";
import { ProjectsLoadError } from "./ProjectsLoadError";
import styles from "./Projects.module.css";

export type CreateProjectPageProps = {
  readonly catalogue: Loaded<readonly TeamRoleCatalogueEntry[]>;
  /** Today, resolved on the server so the default does not depend on the clock in the browser. */
  readonly today: string;
};

/**
 * Defining a new project.
 *
 * The status choice is deliberately short. A project can only be created as Not
 * started or Starting — the backend refuses anything further along, because a
 * project that begins life "in progress" has no record of ever having been
 * planned.
 */
export function CreateProjectPage({ catalogue, today }: CreateProjectPageProps) {
  if (!catalogue.ok) {
    return (
      <div className={styles.page}>
        <PageHeader title="New project" />
        <ProjectsLoadError>Could not load the team-role catalogue.</ProjectsLoadError>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Where this sits, not a second tab bar: `/projects/new` is a deep route
          and the way back out has to be visible before the form is filled in. */}
      <Breadcrumbs trail={[{ label: "Projects", href: "/projects" }]} current="New project" />
      <PageHeader
        title="New project"
        description="Define the work, when it runs, and the roles it needs."
        actions={<Link href="/projects?view=managed">Cancel</Link>}
      />

      {catalogue.value.length === 0 ? (
        <EmptyState
          title="No team roles are available."
          description="An Organization Admin must create team roles before they can be used as project requirements."
        />
      ) : null}

      <ProjectForm
        mode="create"
        action={createProjectAction}
        catalogue={catalogue.value}
        preservableRoleIds={[]}
        submitLabel="Create project"
        defaults={{
          name: "",
          period: "FIXED",
          startDate: today,
          deadlineDate: "",
          status: "NOT_STARTED",
          generalDescription: "",
          technologies: [],
          requirements: [],
        }}
      />
    </div>
  );
}
