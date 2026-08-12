import Link from "next/link";
import { redirect } from "next/navigation";

import { resolveProductSession } from "@/modules/auth/server/productSession";
import { TeamRoleList } from "@/modules/teamRoles";
import { loadTeamRoles, readIncludeInactive } from "@/modules/teamRoles/server/loadTeamRoles";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";

export const dynamic = "force-dynamic";

/**
 * The organization's staffing vocabulary.
 *
 * Administration, so organization-admin only. Project managers may read the same
 * catalogue through the backend — they need it to say what a project requires —
 * but reading it while authoring a project is not managing it, and this surface
 * is not theirs.
 */
export default async function Page({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | readonly string[] | undefined>>;
}) {
  const session = await resolveProductSession();
  if (!session.authenticated) redirect("/login?session=expired");

  if (!session.user.roles.includes("ORGANIZATION_ADMIN")) {
    return (
      <>
        <PageHeader title="Team roles" />
        <EmptyState
          title="You do not have access to this."
          description="Team roles are managed by organization admins."
        />
      </>
    );
  }

  const includeInactive = readIncludeInactive(await searchParams);
  const teamRoles = await loadTeamRoles(includeInactive);

  return (
    <>
      <PageHeader
        title="Team roles"
        description="The vocabulary projects use to say what they need staffed."
        actions={<Link href="/organization">Back to organization</Link>}
      />

      {teamRoles.ok ? (
        <TeamRoleList teamRoles={teamRoles.value} includeInactive={includeInactive} />
      ) : (
        <EmptyState
          title={
            teamRoles.reason === "FORBIDDEN"
              ? "You do not have access to this."
              : "Could not load team roles."
          }
          description={teamRoles.reason === "FORBIDDEN" ? undefined : "Try again shortly."}
        />
      )}
    </>
  );
}
