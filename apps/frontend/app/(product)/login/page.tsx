import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LoginPage } from "@/modules/auth";
import { resolveProductSession } from "@/modules/auth/server/productSession";

export const metadata: Metadata = { title: "Sign in · Potriv" };
export const dynamic = "force-dynamic";

export default async function Page() {
  // Only after a real session check — redirecting because some cookie string
  // exists is how login/home loops are built.
  const session = await resolveProductSession();
  if (session.authenticated) redirect("/home");

  return (
    <Suspense>
      <LoginPage />
    </Suspense>
  );
}
