import { redirect } from "next/navigation";

import { SignOutButton } from "@/modules/auth";
import { resolveProductSession } from "@/modules/auth/server/productSession";
import { getNavigationItems } from "@/shared/config/navigation";
import { AppShell } from "@/shared/ui/AppShell";

/**
 * The authenticated product frame.
 *
 * Middleware only checked that a cookie exists; this is where the session is
 * actually established, by asking the backend who the caller is. If that fails
 * the user goes to login — the cookies are cleared by the route that owns them,
 * not here, because a layout cannot set cookies.
 *
 * Navigation is composed from the real roles. It is presentation: the session
 * check above is what decides whether anyone gets in at all.
 */
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await resolveProductSession();

  if (!session.authenticated) {
    // A stale access cookie would otherwise bounce between here and middleware
    // forever, so the destination clears cookies before showing the form.
    redirect("/login?session=expired");
  }

  const { user } = session;

  return (
    <AppShell
      user={{ name: user.displayName, roles: user.roles }}
      navigationItems={getNavigationItems(user.roles)}
      accountActions={<SignOutButton />}
    >
      {children}
    </AppShell>
  );
}
