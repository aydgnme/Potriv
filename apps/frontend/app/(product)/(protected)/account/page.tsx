import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AccountPage } from "@/modules/account";
import { loadAccount } from "@/modules/account/server/loadAccount";
import { resolveProductSession } from "@/modules/auth/server/productSession";

export const metadata: Metadata = { title: "Account · Potriv" };

export const dynamic = "force-dynamic";

/**
 * Account: self-service for every authenticated user, with no role gate beyond
 * being signed in.
 *
 * Identity comes from the session the protected layout already resolved, so this
 * route spends exactly one request — the sessions read. Asking `/auth/me` again
 * would be a second round trip for an answer already in hand.
 */
export default async function Page() {
  const session = await resolveProductSession();
  // The protected layout already redirected; this narrows the type and keeps the
  // page honest if it is ever mounted elsewhere.
  if (!session.authenticated) redirect("/login?session=expired");

  const data = await loadAccount();

  return <AccountPage user={session.user} data={data} />;
}
