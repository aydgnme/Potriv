import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { InvitePage } from "@/modules/auth/components/InvitePage";
import { resolveProductSession } from "@/modules/auth/server/productSession";

/**
 * The destination of the invite links the backend generates.
 *
 * `{app.frontend-url}/invite?token=…` has been produced by `InviteTokenService`
 * all along; until now nothing served it. This is that page.
 */
export const metadata: Metadata = {
  title: "Join a Potriv workspace · Potriv",
  /* An invite URL is a capability. Keeping it out of search indexes costs
     nothing and removes one way for a live token to be republished. */
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  /**
   * Somebody already signed in cannot use an invite: registering would create a
   * second account, and the backend would reject the address anyway. Sending
   * them to the product is the honest outcome, and it matches what /login and
   * /create-workspace already do — checked against the backend rather than
   * inferred from a cookie being present.
   */
  const session = await resolveProductSession();
  if (session.authenticated) redirect("/home");

  const params = await searchParams;
  // A repeated ?token= yields an array; only a single value is a usable token.
  const hasToken = typeof params.token === "string" && params.token.length > 0;

  /**
   * Only whether a token is present crosses to the client — never its value.
   *
   * A prop passed to a client component is serialised into the RSC payload
   * embedded in the HTML, so handing the token down would write it into the
   * document as well as the URL: a second copy, in something that proxies and
   * caches may retain. The form reads the real value straight out of
   * `window.location` at submit time, so the token lives in exactly one place.
   */
  return <InvitePage hasToken={hasToken} />;
}
