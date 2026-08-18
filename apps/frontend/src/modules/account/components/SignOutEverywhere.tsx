"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Alert } from "@/shared/ui/Alert";
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
 * not succeed the copy says so rather than implying a stolen session was closed.
 *
 * There is no retry button. Re-issuing an unsafe mutation after an ambiguous
 * failure is exactly how one ends up revoking a session somebody has since
 * signed back into.
 */
export function SignOutEverywhere() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [partial, setPartial] = useState(false);

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

    if (!revokedEverywhere) {
      // Local cookies are already cleared, so this browser is signed out. Say
      // only that, and let the person decide what to do about the rest.
      setPending(false);
      setPartial(true);
      return;
    }

    router.replace("/login");
    router.refresh();
  }

  return (
    <div className={styles.controls}>
      {partial ? (
        <Alert tone="warning" title="Signed out here only">
          You have been signed out of this browser, but the other sessions could not be
          confirmed as ended. Open Account again from another sign-in to check them.
        </Alert>
      ) : null}

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
