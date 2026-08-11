import { redirect } from "next/navigation";

import { resolveProductSession } from "@/modules/auth/server/productSession";
import { PeoplePage } from "@/modules/people";
import {
  grantedViews,
  normalizePeopleQuery,
  type RawSearchParams,
} from "@/modules/people/model/peopleQuery";
import { loadPeople } from "@/modules/people/server/loadPeople";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";

export const dynamic = "force-dynamic";

/**
 * People, composed from what this session may actually ask.
 *
 * The requested view is narrowed against the role set **before** any privileged
 * source is called, and somebody with neither role is refused without either
 * endpoint being touched.
 */
export default async function Page({
  searchParams,
}: {
  readonly searchParams: Promise<RawSearchParams>;
}) {
  const session = await resolveProductSession();
  if (!session.authenticated) redirect("/login?session=expired");

  const { roles, userId } = session.user;
  const views = grantedViews(roles);
  const active = normalizePeopleQuery(await searchParams, roles);

  if (active === null) {
    return (
      <>
        <PageHeader title="People" />
        <EmptyState
          title="You do not have access to this."
          description="People is managed by organization admins and department managers."
        />
      </>
    );
  }

  const data = await loadPeople(active);

  return <PeoplePage views={views} active={active} data={data} currentUserId={userId} />;
}
