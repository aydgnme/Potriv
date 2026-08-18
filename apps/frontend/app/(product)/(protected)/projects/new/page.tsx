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
    /**
     * Administering an organization does not include managing its projects.
     *
     * `POST /projects` is PROJECT_MANAGER-only, and registering an organization
     * grants `EMPLOYEE` and `ORGANIZATION_ADMIN` — so a founder following the
     * Home checklist arrives here entitled to nothing. The way out is real but
     * narrow, and only an organization admin has it: while they are the only
     * member, they may add the role to their own account from People. Saying so
     * is the difference between a refusal and a dead end.
     *
     * Nobody else is told about that route, because for them it does not exist.
     */
    return (
      <ProjectPermissionDenied>
        {session.user.roles.includes("ORGANIZATION_ADMIN")
          ? "Creating a project needs the Project Manager role, which administering the "
            + "organization does not include. While you are the only member of this workspace "
            + "you can add it to your own account from People."
          : "Only a project manager can create projects."}
      </ProjectPermissionDenied>
    );
  }

  const catalogue = await loadCreateForm();
  const today = new Date().toISOString().slice(0, 10);

  return <CreateProjectPage catalogue={catalogue} today={today} />;
}
