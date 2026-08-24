"use client";

import Link from "next/link";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";

import { confirmWorkspace } from "../api/authClient";
import { scrubLocation, tokenFromFragment } from "../model/credentialUrl";

import { PublicAuthShell } from "./PublicAuthShell";
import styles from "./AuthPage.module.css";

/**
 * Confirms a workspace registration from an emailed link, and is the only
 * place the organization and its first administrator are actually created.
 *
 * The token arrives in the URL **fragment**, exactly like {@link
 * ../components/ResetPasswordPage} and for the same reason: a fragment is
 * never sent to a server, so it cannot reach an access log, a reverse proxy,
 * a platform trace or a `Referer` header. Read once into a ref on mount and
 * removed from the address bar immediately after.
 *
 * Confirmation is an explicit action, not something that fires on page load:
 * a link opened by a mail client's own link-prefetcher, or by anyone other
 * than the person who requested the workspace, must not be enough by itself
 * to create an account.
 */
type TokenState = "reading" | "present" | "absent";

export function ConfirmWorkspacePage() {
  const tokenRef = useRef("");
  const consumed = useRef(false);
  const [tokenState, setTokenState] = useState<TokenState>("reading");

  useEffect(() => {
    if (consumed.current) return;
    consumed.current = true;

    tokenRef.current = tokenFromFragment(window.location.hash);
    setTokenState(tokenRef.current ? "present" : "absent");

    scrubLocation();
  }, []);

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  async function handleConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tokenRef.current) return;
    setFormError(null);
    setSubmitting(true);
    const outcome = await confirmWorkspace(tokenRef.current);
    setSubmitting(false);

    if (!outcome.ok) {
      setFormError(outcome.error.message);
      return;
    }
    // register-admin/verify returns no token pair, so auto-login would mean
    // either replaying the password against /auth/login or fabricating a
    // session — the administrator is told to sign in instead.
    setConfirmed(true);
  }

  if (tokenState === "reading") {
    return (
      <PublicAuthShell
        title="Confirm your workspace"
        contextTitle="One organization, and its first administrator."
        contextBody="Everything else — departments, skills, projects — is set up inside the workspace afterwards."
        topology="createWorkspace"
      >
        <p className={styles.intro}>Checking your link…</p>
      </PublicAuthShell>
    );
  }

  if (tokenState === "absent") {
    return (
      <PublicAuthShell
        title="This link is no longer valid"
        contextTitle="One organization, and its first administrator."
        contextBody="Everything else — departments, skills, projects — is set up inside the workspace afterwards."
        topology="createWorkspace"
        footer={<Link href="/create-workspace">Start over</Link>}
      >
        <Alert tone="danger">
          This confirmation link is no longer valid. Start over to create your
          workspace.
        </Alert>
      </PublicAuthShell>
    );
  }

  if (confirmed) {
    return (
      <PublicAuthShell
        title="Your workspace is ready"
        contextTitle="One organization, and its first administrator."
        contextBody="Everything else — departments, skills, projects — is set up inside the workspace afterwards."
        topology="createWorkspace"
      >
        <div className={styles.success}>
          <p className={styles.successBody}>
            The organization and its administrator account were created. Sign
            in to add departments, team roles and the people who will work in
            it.
          </p>
          <div className={styles.successActions}>
            <Link className={styles.successPrimary} href="/login">
              Sign in
            </Link>
          </div>
        </div>
      </PublicAuthShell>
    );
  }

  return (
    <PublicAuthShell
      title="Confirm your workspace"
      contextTitle="One organization, and its first administrator."
      contextBody="Everything else — departments, skills, projects — is set up inside the workspace afterwards."
      topology="createWorkspace"
      footer={<Link href="/login">Back to sign in</Link>}
    >
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <p className={styles.intro}>
        Confirm this email address to finish creating your workspace.
      </p>
      <form className={styles.form} onSubmit={handleConfirm} noValidate>
        <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting}>
          {submitting ? "Confirming…" : "Confirm and create workspace"}
        </Button>
      </form>
    </PublicAuthShell>
  );
}
