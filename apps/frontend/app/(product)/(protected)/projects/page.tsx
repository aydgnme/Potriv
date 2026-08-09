import { redirect } from "next/navigation";

import { resolveProductSession } from "@/modules/auth/server/productSession";
import { ProjectsPage } from "@/modules/projects";
import { normalizeProjectsQuery, type RawSearchParams } from "@/modules/projects/model/projectsQuery";
import { loadProjectsView } from "@/modules/projects/server/loadProjectsView";

export const dynamic = "force-dynamic";

/**
 * The Projects route: resolve the session, normalize the URL against what the
 * roles grant, load that one scope, render. Everything else belongs to the
 * projects module.
 */
export default async function Page({
  searchParams,
}: {
  readonly searchParams: Promise<RawSearchParams>;
}) {
  const session = await resolveProductSession();
  // The protected layout already redirected; this narrows the type and keeps the
  // page honest if it is ever mounted elsewhere.
  if (!session.authenticated) redirect("/login?session=expired");

  const { user } = session;
  const query = normalizeProjectsQuery(await searchParams, user.roles);
  const view = await loadProjectsView(query);

  return <ProjectsPage roles={user.roles} query={query} view={view} />;
}
