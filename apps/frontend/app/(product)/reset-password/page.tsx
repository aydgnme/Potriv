import type { Metadata } from "next";
import { Suspense } from "react";

import { ResetPasswordPage } from "@/modules/auth";

export const metadata: Metadata = { title: "Set a new password · Potriv" };

export default function Page() {
  return (
    <Suspense>
      <ResetPasswordPage />
    </Suspense>
  );
}
