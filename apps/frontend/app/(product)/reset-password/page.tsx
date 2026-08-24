import type { Metadata } from "next";

import { ResetPasswordPage } from "@/modules/auth";

export const metadata: Metadata = {
  title: "Set a new password · Potriv",
  /* A reset link is a capability. Keeping it out of search indexes costs
     nothing and removes one way for a live token to be republished. */
  robots: { index: false, follow: false },
};

/*
  Rendered per request, because the middleware serves this route under a
  nonce-based CSP and a prerendered page carries no nonce — its own hydration
  script would then be refused by the policy meant to protect it. Every route in
  `SENSITIVE_ROUTES` has to say this; the CSP contract test pins the pairing.

  There is nothing dynamic about the page itself: it takes no request data, and
  the token it works with is in the fragment, which no server ever sees.
*/
export const dynamic = "force-dynamic";

/*
  No Suspense boundary any more. It was here because the page read the token
  with `useSearchParams`, which suspends. The token is in the fragment now —
  which the server never sees — so it is read in an effect after mount, and
  there is nothing left to suspend on.
*/
export default function Page() {
  return <ResetPasswordPage />;
}
