import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { resolveProductSession } from "@/modules/auth/server/productSession";
import { CreateProjectPage } from "@/modules/projects/components/CreateProjectPage";
import { ProjectPermissionDenied } from "@/modules/projects/components/ProjectPermissionDenied";
import { loadCreateForm } from "@/modules/projects/server/loadProjectViews";

export const metadata: Metadata = { title: "New project · Potriv" };

export const dynamic = "force-dynamic";

/**
 * Creating a project. Only a project manager may, and the check happens **before**
 * the PM-only catalogue is requested — asking and swallowing the refusal would
 * make capability depend on error handling.
 */
export default async function Page() {
  const session = await resolveProductSession();
  if (!session.authenticated) redirect("/login?session=expired");

  if (!session.user.roles.includes("PROJECT_MANAGER")) {
    return <ProjectPermissionDenied>Only a project manager can create projects.</ProjectPermissionDenied>;
  }

  const catalogue = await loadCreateForm();
  const today = new Date().toISOString().slice(0, 10);

  return <CreateProjectPage catalogue={catalogue} today={today} />;
}
