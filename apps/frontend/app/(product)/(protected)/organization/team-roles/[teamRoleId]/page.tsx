import Link from "next/link";
import { redirect } from "next/navigation";

import { resolveProductSession } from "@/modules/auth/server/productSession";
import { TeamRoleDetail } from "@/modules/teamRoles";
import { loadTeamRoleDetail } from "@/modules/teamRoles/server/loadTeamRoles";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  readonly params: Promise<{ readonly teamRoleId: string }>;
}) {
  const session = await resolveProductSession();
  if (!session.authenticated) redirect("/login?session=expired");

  if (!session.user.roles.includes("ORGANIZATION_ADMIN")) {
    return (
      <>
        <PageHeader title="Team role" />
        <EmptyState
          title="You do not have access to this."
          description="Team roles are managed by organization admins."
        />
      </>
    );
  }

  const { teamRoleId } = await params;
  const state = await loadTeamRoleDetail(teamRoleId);

  if (state.kind !== "ready") {
    return (
      <>
        <PageHeader title="Team role" />
        <EmptyState
          // A team role in another organization and one that never existed give
          // the same answer.
          title={
            state.kind === "unavailable"
              ? "This team role does not exist or is not visible to you."
              : "Could not load this team role."
          }
          action={<Link href="/organization/team-roles">Back to team roles</Link>}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={state.teamRole.name}
        actions={<Link href="/organization/team-roles">Back to team roles</Link>}
      />
      <TeamRoleDetail teamRole={state.teamRole} />
    </>
  );
}
