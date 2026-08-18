"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@/shared/ui/Button";

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
 * **Both outcomes leave the protected route.** Once the cookies are gone this
 * browser is signed out, and an Account page still sitting there — rendered
 * before the mutation and now un-refreshable — would be a protected surface
 * presenting itself as live to a session that no longer exists. So the failure
 * path redirects too, and carries its caveat to `/login`, which is where the
 * person actually is.
 *
 * There is no retry button. Re-issuing an unsafe mutation after an ambiguous
 * failure is exactly how one ends up revoking a session somebody has since
 * signed back into.
 */
export function SignOutEverywhere() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);

  async function signOutEverywhere() {
    setPending(true);
    dialogRef.current?.close();

    let revokedEverywhere = false;
    try {
      const response = await fetch("/api/auth/logout-all", { method: "POST" });
      const body: unknown = await response.json().catch(() => null);
      revokedEverywhere =
        response.ok &&
        typeof body === "object" &&
        body !== null &&
        (body as { revokedEverywhere?: unknown }).revokedEverywhere === true;
    } catch {
      revokedEverywhere = false;
    }

    // Local cookies are cleared either way, so the browser leaves either way.
    // Only the message differs: the failure path admits that the other sessions
    // were not confirmed, using the same login-notice channel as every other
    // safe auth outcome.
    router.replace(revokedEverywhere ? "/login" : "/login?logout=local-only");
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
