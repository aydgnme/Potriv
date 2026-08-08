"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/shared/ui/Button";

import { signOut } from "../api/authClient";

/**
 * Signing out is a POST, never a link: it mutates the session, and a GET would
 * be triggerable by anything that can make the browser issue one.
 *
 * The browser is sent to login regardless of what the server reports, because a
 * page that still looks signed in after the user asked to leave is the worse
 * failure.
 */
export function SignOutButton() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleSignOut} loading={signingOut}>
      Sign out
    </Button>
  );
}
