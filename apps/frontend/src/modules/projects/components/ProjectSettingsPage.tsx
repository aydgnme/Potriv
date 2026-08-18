import Link from "next/link";

import { Breadcrumbs } from "@/shared/ui/Breadcrumbs";
import { PageHeader } from "@/shared/ui/PageHeader";

import { updateProjectAction } from "../server/actions/projectActions";
import type { ProjectEditorData } from "../server/loadProjectViews";

import { ProjectDeleteSection } from "./ProjectDeleteSection";
import { ProjectForm } from "./ProjectForm";
import { ProjectUnavailable } from "./ProjectUnavailable";
import styles from "./Projects.module.css";

export type ProjectSettingsPageProps = {
  readonly projectId: string;
  readonly data: ProjectEditorData;
};

/**
 * Changing a project's definition.
 *
 * Prefilled from `GET /projects/{id}` — the owner's management representation —
 * rather than from `/details`, which is what a reader sees. They are not the same
 * object, and a form built from the reader's view would mean something different
 * from what it saves.
 *
 * If the team-role catalogue could not be loaded, saving is blocked rather than
 * attempted. This screen submits the complete definition, so an incomplete
 * catalogue would mean saving a requirement list assembled from whatever
 * happened to load — quietly dropping roles the project actually has.
 */
export function ProjectSettingsPage({ projectId, data }: ProjectSettingsPageProps) {
  if (!data.project.ok) {
    return (
      <div className={styles.page}>
        <PageHeader title="Project settings" />
        <ProjectUnavailable reason={data.project.reason} />
      </div>
    );
  }

  const project = data.project.value;
  const catalogue = data.catalogue.ok ? data.catalogue.value : [];
  const attachedRoleIds = project.teamRoles.map((role) => role.teamRoleId);

  return (
    <div className={styles.page}>
      <Breadcrumbs
        trail={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${projectId}` },
        ]}
        current="Edit"
      />
      <PageHeader
        title={project.name}
        description="Edit this project's definition, schedule and team-role requirements."
      />

      <ProjectForm
        mode="edit"
        action={updateProjectAction}
        projectId={projectId}
        catalogue={catalogue}
        preservableRoleIds={attachedRoleIds}
        submitLabel="Save changes"
        blockedReason={
          data.catalogue.ok
            ? undefined
            : "Team roles could not be loaded, so this project cannot be saved right now. Reload the page to try again."
        }
        defaults={{
          name: project.name,
          period: project.period,
          startDate: project.startDate ?? "",
          deadlineDate: project.deadlineDate ?? "",
          status: project.status,
          generalDescription: project.generalDescription ?? "",
          technologies: project.technologyStack,
          requirements: project.teamRoles.map((role) => ({
            teamRoleId: role.teamRoleId,
            requiredMembers: role.requiredMembers,
          })),
        }}
      />

      {/* Last on the page, and never in the Overview header: deleting is not
          something to reach on the way to somewhere else. */}
      <ProjectDeleteSection projectId={projectId} projectName={project.name} />
    </div>
  );
}
