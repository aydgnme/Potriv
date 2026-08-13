import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { resolveProductSession } from "@/modules/auth/server/productSession";
import { ProjectOverview } from "@/modules/projects/components/ProjectOverview";
import { loadProjectOverview, ownsProject } from "@/modules/projects/server/loadProjectViews";

export const metadata: Metadata = { title: "Project · Potriv" };

export const dynamic = "force-dynamic";

/**
 * A project, for anyone with a relationship to it. The relationship-aware
 * `/details` read decides who that is — never a role check here.
 */
export default async function Page({
  params,
}: {
  readonly params: Promise<{ readonly projectId: string }>;
}) {
  const session = await resolveProductSession();
  if (!session.authenticated) redirect("/login?session=expired");

  const { projectId } = await params;
  const data = await loadProjectOverview(projectId);

  return (
    <ProjectOverview
      projectId={projectId}
      data={data}
      canManage={
        data.ok &&
        ownsProject(session.user.roles, session.user.userId, data.value.projectManager.userId)
      }
    />
  );
}
