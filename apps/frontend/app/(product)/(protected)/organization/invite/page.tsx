import Link from "next/link";
import { redirect } from "next/navigation";

import { resolveProductSession } from "@/modules/auth/server/productSession";
import { InvitePanel } from "@/modules/organization";
import { loadInviteState } from "@/modules/organization/server/loadOrganization";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";

export const dynamic = "force-dynamic";

/**
 * The organization's invite link.
 *
 * Anyone holding this link can join the organization, so the role check runs
 * before the read: a non-admin reaching the route directly must not cause the
 * invite to be fetched at all, let alone rendered.
 */
export default async function Page() {
  const session = await resolveProductSession();
  if (!session.authenticated) redirect("/login?session=expired");

  if (!session.user.roles.includes("ORGANIZATION_ADMIN")) {
    return (
      <>
        <PageHeader title="Invite link" />
        <EmptyState
          title="You do not have access to this."
          description="The organization invite is managed by organization admins."
        />
      </>
    );
  }

  const invite = await loadInviteState();

  return (
    <>
      <PageHeader
        title="Invite link"
        description="People join the organization as employees with this link."
        actions={<Link href="/organization">Back to organization</Link>}
      />
      <InvitePanel invite={invite} />
    </>
  );
}
