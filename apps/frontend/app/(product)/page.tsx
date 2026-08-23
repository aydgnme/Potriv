import type { Metadata } from "next";

import { HomePage } from "@/modules/marketing";

/**
 * The public entry point.
 *
 * `/` used to be a session-aware redirector: it asked the backend who you were
 * and sent you to /home or /login. It is now the marketing landing page, and
 * deliberately asks nothing — no session lookup, no cookie read, no backend
 * call. An anonymous visitor and a signed-in one are served identical bytes,
 * which is what makes this route cacheable, fast, and impossible to leak
 * anything through.
 *
 * Signed-in visitors are not bounced to /home. Landing on your own product's
 * front page is not an error to be corrected, and the header's Sign in link
 * takes anyone who wants the app there in one click.
 *
 * Nothing else about authentication moved: /login, the protected layout's
 * /auth/me check and the proxy's cookie routing are all untouched, and the
 * proxy never matched `/` in the first place.
 */
export const metadata: Metadata = {
  title: "Potriv — Build the right project team with the people you already have",
  description:
    "Potriv connects project requirements with your organization's people, " +
    "skills, roles and real availability — then keeps staffing decisions " +
    "explicit and reviewable. Read the operating problem, the model, and the " +
    "four chapters that explain how a requirement becomes a reviewed allocation.",
};

export default function Page() {
  return <HomePage />;
}
