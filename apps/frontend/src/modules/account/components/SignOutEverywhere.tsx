"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@/shared/ui/Button";

import { classifyLogoutOutcome, destinationFor } from "../model/logoutOutcome";

import styles from "./Account.module.css";

/**
 * Signing out of every session, including this one.
 *
 * This makes a stronger promise than ordinary sign out: it claims something
 * about other devices. So the two halves are reported separately.
 *
 * The local half always happens — the BFF clears this browser's cookies
 * regardless, because somebody who asked to be signed out should not be left
 * looking authenticated. The remote half is the backend's answer, and if it did
 * not succeed the message says so rather than implying a stolen session was
 * closed.
 *
 * **A confirmed sign-out leaves the protected route.** Once the cookies are gone
 * this browser is signed out, and an Account page still sitting there — rendered
 * before the mutation and now un-refreshable — would be a protected surface
 * presenting itself as live to a session that no longer exists.
 *
 * But "confirmed" has to mean confirmed. A response is what shows the BFF ran
 * and cleared the cookies; if the request never produced one, nothing is known,
 * and the browser goes back to Account with a marker so the **server** can
 * settle it. See `classifyLogoutOutcome` for why guessing there would be worse
 * than it looks.
 *
 * There is no retry button in any of the three cases. Re-issuing an unsafe
 * mutation after an ambiguous failure is exactly how one ends up revoking a
 * session somebody has since signed back into.
 */
export function SignOutEverywhere() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);

  async function signOutEverywhere() {
    setPending(true);
    dialogRef.current?.close();

    let outcome;
    try {
      const response = await fetch("/api/auth/logout-all", { method: "POST" });
      const body: unknown = await response.json().catch(() => null);
      outcome = classifyLogoutOutcome(response.ok, body);
    } catch {
      // The request never completed, so the route may not have run and this
      // browser may still be signed in. Nothing is claimed either way.
      outcome = "UNCONFIRMED" as const;
    }

    router.replace(destinationFor(outcome));
    // Re-runs the server render, which is what actually re-checks the session.
    router.refresh();
  }

  return (
    <div className={styles.controls}>
      <p className={styles.sectionNote}>
        Signing out ends this session. Signing out everywhere ends every session on every
        device, including this one.
      </p>

      <div className={styles.controlRow}>
        <Button
          variant="secondary"
          onClick={() => dialogRef.current?.showModal()}
          loading={pending}
        >
          Sign out everywhere
        </Button>
      </div>

      <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="logout-all-title">
        <h3 id="logout-all-title" className={styles.groupHeading}>
          Sign out everywhere?
        </h3>
        {/* A security action, stated plainly — not styled as data deletion,
            because nothing is being deleted. */}
        <p>Every session, including this one, will be signed out.</p>
        <div className={styles.dialogActions}>
          <Button variant="secondary" onClick={() => dialogRef.current?.close()}>
            Cancel
          </Button>
          <Button variant="primary" onClick={signOutEverywhere}>
            Sign out everywhere
          </Button>
        </div>
      </dialog>
    </div>
  );
}
