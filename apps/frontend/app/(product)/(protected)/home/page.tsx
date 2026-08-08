import { redirect } from "next/navigation";

import { HomePage } from "@/modules/home";
import { SECTION_PREVIEW_LIMIT, loadHomeData } from "@/modules/home/server/loadHome";
import { resolveProductSession } from "@/modules/auth/server/productSession";

export const dynamic = "force-dynamic";

/**
 * The authenticated landing route: resolve the session, load what the user's
 * roles allow, render. Composition belongs to the home module.
 */
export default async function Page() {
  const session = await resolveProductSession();
  // The protected layout already redirected; this narrows the type and keeps the
  // page honest if it is ever mounted elsewhere.
  if (!session.authenticated) redirect("/login?session=expired");

  const { user } = session;
  const data = await loadHomeData(user.roles);

  return (
    <HomePage
      displayName={user.displayName}
      roles={user.roles}
      data={data}
      previewLimit={SECTION_PREVIEW_LIMIT}
    />
  );
}
