import type { Metadata } from "next";

import { ResetPasswordPage } from "@/modules/auth";

export const metadata: Metadata = {
  title: "Set a new password · Potriv",
  /* A reset link is a capability. Keeping it out of search indexes costs
     nothing and removes one way for a live token to be republished. */
  robots: { index: false, follow: false },
};

/*
  No Suspense boundary any more. It was here because the page read the token
  with `useSearchParams`, which suspends. The token is in the fragment now —
  which the server never sees — so it is read in an effect after mount, and
  there is nothing left to suspend on.
*/
export default function Page() {
  return <ResetPasswordPage />;
}
