import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { resolveProductSession } from "@/modules/auth/server/productSession";
import { TeamRoleForm } from "@/modules/teamRoles";
import { EmptyState } from "@/shared/ui/EmptyState";
import { Breadcrumbs } from "@/shared/ui/Breadcrumbs";
import { PageHeader } from "@/shared/ui/PageHeader";

export const metadata: Metadata = { title: "New team role · Potriv" };

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await resolveProductSession();
  if (!session.authenticated) redirect("/login?session=expired");

  if (!session.user.roles.includes("ORGANIZATION_ADMIN")) {
    return (
      <>
        <PageHeader title="New team role" />
        <EmptyState
          title="You do not have access to this."
          description="Team roles are managed by organization admins."
        />
      </>
    );
  }

  return (
    <>
      <Breadcrumbs trail={[
          { label: "Organization", href: "/organization" },
          { label: "Team roles", href: "/organization/team-roles" },
        ]} current={"New team role"} />
      <PageHeader
        title="New team role"
        description="Team roles describe project staffing needs. They do not grant application permissions."
      />
      <TeamRoleForm />
    </>
  );
}
