import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { resolveProductSession } from "@/modules/auth/server/productSession";
import { ProjectPermissionDenied } from "@/modules/projects/components/ProjectPermissionDenied";
import { ProjectSettingsPage } from "@/modules/projects/components/ProjectSettingsPage";
import { loadProjectEditor } from "@/modules/projects/server/loadProjectViews";

export const metadata: Metadata = { title: "Project settings · Potriv" };

export const dynamic = "force-dynamic";

/**
 * Project settings, for the owning project manager.
 *
 * The role is checked before any management source is called; ownership is then
 * the backend's to decide — a project this manager does not own answers 404, the
 * same as one that does not exist, so being refused never confirms it is there.
 */
export default async function Page({
  params,
}: {
  readonly params: Promise<{ readonly projectId: string }>;
}) {
  const session = await resolveProductSession();
  if (!session.authenticated) redirect("/login?session=expired");

  const { projectId } = await params;

  if (!session.user.roles.includes("PROJECT_MANAGER")) {
    return <ProjectPermissionDenied>Only a project manager can change project settings.</ProjectPermissionDenied>;
  }

  const data = await loadProjectEditor(projectId);

  return <ProjectSettingsPage projectId={projectId} data={data} />;
}
