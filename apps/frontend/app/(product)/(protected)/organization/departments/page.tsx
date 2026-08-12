import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { resolveProductSession } from "@/modules/auth/server/productSession";
import { DepartmentList } from "@/modules/organization";
import { loadDepartments } from "@/modules/organization/server/loadOrganization";
import { EmptyState } from "@/shared/ui/EmptyState";
import { Breadcrumbs } from "@/shared/ui/Breadcrumbs";
import { PageHeader } from "@/shared/ui/PageHeader";

export const metadata: Metadata = { title: "Departments · Potriv" };

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await resolveProductSession();
  if (!session.authenticated) redirect("/login?session=expired");

  if (!session.user.roles.includes("ORGANIZATION_ADMIN")) {
    return (
      <>
        <PageHeader title="Departments" />
        <EmptyState
          title="You do not have access to this."
          description="Departments are managed by organization admins."
        />
      </>
    );
  }

  const departments = await loadDepartments();

  return (
    <>
      <Breadcrumbs trail={[{ label: "Organization", href: "/organization" }]} current={"Departments"} />
      <PageHeader
        title="Departments"
        description="Departments hold people and review staffing requests."
      />

      {departments.ok ? (
        <DepartmentList departments={departments.value} />
      ) : (
        <EmptyState
          title={
            departments.reason === "FORBIDDEN"
              ? "You do not have access to this."
              : "Could not load departments."
          }
          description={
            departments.reason === "FORBIDDEN" ? undefined : "Try again shortly."
          }
        />
      )}
    </>
  );
}
