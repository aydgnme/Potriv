import type { Metadata } from "next";

import { ForgotPasswordPage } from "@/modules/auth";

export const metadata: Metadata = { title: "Reset your password · Potriv" };

/*
  Per-request, so the nonce-based CSP the middleware puts on this route has a
  freshly rendered page to stamp. A prerendered one would carry no nonce and the
  policy would block its own hydration script. See `SENSITIVE_ROUTES`.
*/
export const dynamic = "force-dynamic";

export default function Page() {
  return <ForgotPasswordPage />;
}
