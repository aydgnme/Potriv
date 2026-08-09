import { redirect } from "next/navigation";

import { resolveProductSession } from "@/modules/auth/server/productSession";
import { ProjectTeamView } from "@/modules/projects/components/ProjectTeamView";
import {
  loadProjectOverview,
  loadProjectTeamView,
  ownsProject,
} from "@/modules/projects/server/loadProjectViews";

export const dynamic = "force-dynamic";

/**
 * A project's people. `/team` carries the three groups but not the project
 * manager's id, so ownership — which decides whether Edit appears — comes from
 * the same relationship-aware details read the Overview uses.
 */
export default async function Page({
  params,
}: {
  readonly params: Promise<{ readonly projectId: string }>;
}) {
  const session = await resolveProductSession();
  if (!session.authenticated) redirect("/login?session=expired");

  const { projectId } = await params;
  const [data, details] = await Promise.all([
    loadProjectTeamView(projectId),
    loadProjectOverview(projectId),
  ]);

  return (
    <ProjectTeamView
      projectId={projectId}
      data={data}
      canManage={
        details.ok &&
        ownsProject(session.user.roles, session.user.userId, details.value.projectManager.userId)
      }
    />
  );
}
