import type { Metadata } from "next";

import { ForgotPasswordPage } from "@/modules/auth";

export const metadata: Metadata = { title: "Reset your password · Potriv" };

export default function Page() {
  return <ForgotPasswordPage />;
}
