import { resolveProductSession } from "@/modules/auth/server/productSession";
import { PageHeader } from "@/shared/ui/PageHeader";

export const dynamic = "force-dynamic";

/**
 * The authenticated landing route.
 *
 * Deliberately almost empty: FE-03 owns the role-composed dashboard and the data
 * behind it. Inventing counts here would mean building something to be deleted.
 */
export default async function Page() {
  const session = await resolveProductSession();
  const name = session.authenticated ? session.user.displayName : "";

  return (
    <>
      <PageHeader title="Home" description={`Welcome back, ${name}.`} />
    </>
  );
}
