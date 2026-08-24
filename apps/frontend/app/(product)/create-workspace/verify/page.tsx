import type { Metadata } from "next";

import { ConfirmWorkspacePage } from "@/modules/auth/components/ConfirmWorkspacePage";

export const metadata: Metadata = {
  title: "Confirm your workspace · Potriv",
  /* A confirmation link is a capability. Keeping it out of search indexes
     costs nothing and removes one way for a live token to be republished. */
  robots: { index: false, follow: false },
};

/*
  Rendered per request, because this route is served under a nonce-based CSP
  and a prerendered page carries no nonce — its own hydration script would
  then be refused by the policy meant to protect it. Every route in
  SENSITIVE_ROUTES has to say this; the CSP contract test pins the pairing.

  There is nothing dynamic about the page itself: it takes no request data,
  and the token it works with is in the fragment, which no server ever sees.
*/
export const dynamic = "force-dynamic";

export default function Page() {
  return <ConfirmWorkspacePage />;
}
