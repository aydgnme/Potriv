import { redirect } from "next/navigation";

import { resolveProductSession } from "@/modules/auth/server/productSession";
import { OrganizationOverview } from "@/modules/organization";
import { loadOrganizationOverview } from "@/modules/organization/server/loadOrganization";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";

export const dynamic = "force-dynamic";

/**
 * Organization administration.
 *
 * The navigation only reveals this to an organization admin, but the sidebar is
 * the browser's and the route is reachable directly — so the role is checked
 * here, before either source is touched. Somebody without it gets the refusal
 * and the backend is never asked anything on their behalf.
 */
export default async function Page() {
  const session = await resolveProductSession();
  if (!session.authenticated) redirect("/login?session=expired");

  if (!session.user.roles.includes("ORGANIZATION_ADMIN")) {
    return (
      <>
        <PageHeader title="Organization" />
        <EmptyState
          title="You do not have access to this."
          description="Organization settings are managed by organization admins."
        />
      </>
    );
  }

  const overview = await loadOrganizationOverview();

  return (
    <>
      <PageHeader
        title="Organization"
        description="Departments and the invite link people join with."
      />
      <OrganizationOverview overview={overview} />
    </>
  );
}
