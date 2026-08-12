import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { resolveProductSession } from "@/modules/auth/server/productSession";
import { StaffingPage } from "@/modules/staffing";
import {
  normalizeReviewStatus,
  type RawSearchParams,
} from "@/modules/staffing/model/staffingQuery";
import { hasStaffingCapability, loadStaffing } from "@/modules/staffing/server/loadStaffing";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";

export const metadata: Metadata = { title: "Staffing · Potriv" };

export const dynamic = "force-dynamic";

/**
 * Staffing, for whoever has a side of the handshake.
 *
 * Capability is checked before any privileged source is called: an employee with
 * neither role gets a permission state and neither endpoint is asked, which keeps
 * capability out of error handling.
 */
export default async function Page({
  searchParams,
}: {
  readonly searchParams: Promise<RawSearchParams>;
}) {
  const session = await resolveProductSession();
  if (!session.authenticated) redirect("/login?session=expired");

  const { roles } = session.user;

  if (!hasStaffingCapability(roles)) {
    return (
      <>
        <PageHeader title="Staffing" />
        <EmptyState
          title="You do not have access to this."
          description="Staffing requests are raised by project managers and reviewed by department managers."
        />
      </>
    );
  }

  const status = normalizeReviewStatus(await searchParams);
  const data = await loadStaffing(status, roles);

  return <StaffingPage data={data} />;
}
