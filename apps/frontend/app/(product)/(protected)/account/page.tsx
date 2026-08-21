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
export default async function Page({
  searchParams,
}: {
  readonly searchParams: Promise<Readonly<Record<string, string | readonly string[] | undefined>>>;
}) {
  const session = await resolveProductSession();
  // The protected layout already redirected; this narrows the type and keeps the
  // page honest if it is ever mounted elsewhere.
  if (!session.authenticated) redirect("/login?session=expired");

  const [data, params] = await Promise.all([loadAccount(), searchParams]);

  /*
    Reaching this line *is* the answer to "did sign-out happen?".

    A browser sent here after an unconfirmed "sign out everywhere" only renders
    Account if the server still accepts its session — otherwise the protected
    layout above has already redirected it to login. So the marker never asserts
    anything itself; it just asks, and the render settles it.
  */
  const signOutUnconfirmed = params.logout === "unconfirmed";

  return (
    <AccountPage user={session.user} data={data} signOutUnconfirmed={signOutUnconfirmed} />
  );
}
