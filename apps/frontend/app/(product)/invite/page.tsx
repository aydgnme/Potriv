import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { InvitePage } from "@/modules/auth/components/InvitePage";
import { resolveProductSession } from "@/modules/auth/server/productSession";

/**
 * The destination of the invite links the backend mails out.
 *
 * The link is `{app.frontend-url}/invite#token=…`. The token is in the
 * **fragment**, which browsers never put on the wire: it reaches no access log,
 * no reverse proxy, no platform trace and no `Referer`. It also never reaches
 * this function — a server component cannot see a fragment, by design and by
 * definition. So this file no longer reads a token, and cannot report whether
 * one is present; that question is answerable only in the browser, and
 * `InvitePage` answers it there.
 */
export const metadata: Metadata = {
  title: "Join a Potriv workspace · Potriv",
  /* An invite URL is a capability. Keeping it out of search indexes costs
     nothing and removes one way for a live token to be republished. */
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function Page() {
  /**
   * Somebody already signed in cannot use an invite: registering would create a
   * second account, and the backend would reject the address anyway. Sending
   * them to the product is the honest outcome, and it matches what /login and
   * /create-workspace already do — checked against the backend rather than
   * inferred from a cookie being present.
   */
  const session = await resolveProductSession();
  if (session.authenticated) redirect("/home");

  return <InvitePage />;
}
