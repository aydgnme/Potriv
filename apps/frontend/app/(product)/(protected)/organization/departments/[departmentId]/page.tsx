import Link from "next/link";
import { redirect } from "next/navigation";

import { resolveProductSession } from "@/modules/auth/server/productSession";
import { DepartmentDetail } from "@/modules/organization";
import { loadDepartmentDetail } from "@/modules/organization/server/loadOrganization";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  readonly params: Promise<{ readonly departmentId: string }>;
}) {
  const session = await resolveProductSession();
  if (!session.authenticated) redirect("/login?session=expired");

  if (!session.user.roles.includes("ORGANIZATION_ADMIN")) {
    return (
      <>
        <PageHeader title="Department" />
        <EmptyState
          title="You do not have access to this."
          description="Departments are managed by organization admins."
        />
      </>
    );
  }

  const { departmentId } = await params;
  const state = await loadDepartmentDetail(departmentId);

  if (state.kind !== "ready") {
    return (
      <>
        <PageHeader title="Department" />
        <EmptyState
          // A department in another organization and one that never existed give
          // the same answer; telling them apart would confirm ids to anyone
          // willing to try them.
          title={
            state.kind === "unavailable"
              ? "This department does not exist or is not visible to you."
              : "Could not load this department."
          }
          action={<Link href="/organization/departments">Back to departments</Link>}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={state.detail.department.name}
        actions={<Link href="/organization/departments">Back to departments</Link>}
      />
      <DepartmentDetail detail={state.detail} />
    </>
  );
}
