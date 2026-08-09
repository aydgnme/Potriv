import { redirect } from "next/navigation";

import { resolveProductSession } from "@/modules/auth/server/productSession";
import { TeamFinderScreen } from "@/modules/staffing";
import {
  normalizeTeamFinderQuery,
  type RawSearchParams,
} from "@/modules/staffing/model/teamFinderQuery";
import { loadTeamFinder } from "@/modules/staffing/server/loadTeamFinder";

export const dynamic = "force-dynamic";

/**
 * Team Finder for one project.
 *
 * The criteria come from the URL, are narrowed to what the backend accepts, and
 * drive exactly one `POST` per render. Who may run it is decided by the loader:
 * the project is read through the relationship-aware endpoint first, so an
 * unrelated caller is refused before this route forms any opinion, and ownership
 * is checked before the finder is called at all.
 */
export default async function Page({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly projectId: string }>;
  readonly searchParams: Promise<RawSearchParams>;
}) {
  const session = await resolveProductSession();
  if (!session.authenticated) redirect("/login?session=expired");

  const [{ projectId }, rawSearchParams] = await Promise.all([params, searchParams]);
  const criteria = normalizeTeamFinderQuery(rawSearchParams);

  const state = await loadTeamFinder(projectId, criteria, {
    userId: session.user.userId,
    roles: session.user.roles,
  });

  return <TeamFinderScreen projectId={projectId} criteria={criteria} state={state} />;
}
