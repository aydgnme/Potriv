import type { Metadata } from "next";

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
   * Signed in or not, the browser gets here first.
   *
   * This used to `redirect("/home")` on the server when a session existed. A
   * redirect keeps the fragment: the browser reattaches it to the destination
   * when the destination has none of its own, so an invite link opened by a
   * signed-in reader landed on `/home#token=…` — and no client component ever
   * mounted on this route to clear it. The token then sat in the address bar of
   * an ordinary product page, and travelled into every history entry and
   * screenshot from there.
   *
   * So the session is reported to the client instead of acted on here, and the
   * redirect happens in the browser *after* the fragment has been read and
   * removed. `authenticated` is a boolean; nothing about the token crosses this
   * boundary, because the server never saw it.
   */
  const session = await resolveProductSession();

  return <InvitePage authenticated={session.authenticated} />;
}
