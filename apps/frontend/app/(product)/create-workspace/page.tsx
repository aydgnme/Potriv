import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CreateWorkspacePage } from "@/modules/auth/components/CreateWorkspacePage";
import { resolveProductSession } from "@/modules/auth/server/productSession";

export const metadata: Metadata = { title: "Create your workspace · Potriv" };
export const dynamic = "force-dynamic";

/**
 * Public workspace creation.
 *
 * Same shape as /login: a real session check first, because somebody already
 * signed in has an organization and does not need a second one. The check is
 * against the backend rather than a cookie's presence, for the same reason
 * login does it that way — a stale cookie is not a session.
 */
export default async function Page() {
  const session = await resolveProductSession();
  if (session.authenticated) redirect("/home");

  return <CreateWorkspacePage />;
}
