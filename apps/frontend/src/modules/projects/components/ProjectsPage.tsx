import Link from "next/link";

import type { AccessRole } from "@/shared/types/accessRole";
import { PageHeader } from "@/shared/ui/PageHeader";

import { grantedScopes, type ProjectsQuery } from "../model/projectsQuery";
import type { ProjectsViewData } from "../server/loadProjectsView";

import { DepartmentProjectsView } from "./DepartmentProjectsView";
import { ManagedProjectsView } from "./ManagedProjectsView";
import { MyProjectsView } from "./MyProjectsView";
import { ProjectStatusFilter } from "./ProjectStatusFilter";
import { ProjectsScopeNav } from "./ProjectsScopeNav";
import styles from "./Projects.module.css";

export type ProjectsPageProps = {
  readonly roles: readonly AccessRole[];
  readonly query: ProjectsQuery;
  readonly view: ProjectsViewData;
};

/**
 * One Projects domain, with the data scopes a role set grants.
 *
 * Not a role switcher. The backend authorises against the whole role set on
 * every request, so nothing here changes who the user is — the scopes ask
 * different questions of different endpoints, and a project can honestly appear
 * in more than one of them meaning something different each time.
 *
 * There is deliberately no organization-wide scope. No ordinary-product endpoint
 * returns every project in the organization, so an "All projects" view would be
 * a screen with nothing behind it.
 */
export function ProjectsPage({ roles, query, view }: ProjectsPageProps) {
  const scopes = grantedScopes(roles);
  const canCreateProject = roles.includes("PROJECT_MANAGER");

  return (
    <div className={styles.page}>
      <PageHeader
        title="Projects"
        description={descriptionFor(query.view)}
        actions={
          canCreateProject ? <Link href="/projects/new">New project</Link> : undefined
        }
      />

      <div className={styles.controls}>
        <ProjectsScopeNav scopes={scopes} query={query} />
        <ProjectStatusFilter query={query} />
      </div>

      {view.view === "managed" ? (
        <ManagedProjectsView
          data={view.data}
          query={query}
          canCreateProject={canCreateProject}
        />
      ) : null}

      {view.view === "department" ? (
        <DepartmentProjectsView data={view.data} query={query} />
      ) : null}

      {view.view === "mine" ? <MyProjectsView data={view.data} query={query} /> : null}
    </div>
  );
}

/** What this scope answers, in one line, so the columns are not the only clue. */
function descriptionFor(view: ProjectsQuery["view"]): string {
  switch (view) {
    case "managed":
      return "Projects you manage.";
    case "department":
      return "Projects your department's people are allocated to.";
    case "mine":
      return "Projects you are allocated to, and have been.";
  }
}
