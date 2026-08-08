import { redirect } from "next/navigation";

import { hasRefreshCookie, resolveProductSession } from "@/modules/auth/server/productSession";

export const dynamic = "force-dynamic";

/**
 * Session-aware entry.
 *
 * The session is verified with the backend rather than inferred from a cookie
 * being present — a stale cookie is not an authentication. Sending a recoverable
 * visitor to /home lets the protected flow refresh through the one controlled
 * path instead of duplicating that logic here.
 */
export default async function Page() {
  const session = await resolveProductSession();
  if (session.authenticated) redirect("/home");

  if (await hasRefreshCookie()) redirect("/home");

  redirect("/login");
}
