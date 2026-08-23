"use client";

import Link from "next/link";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";
import { FormErrorSummary } from "@/shared/ui/FormErrorSummary";
import { Input } from "@/shared/ui/Input";

import { confirmPasswordReset } from "../api/authClient";
import { scrubLocation, tokenFromFragment } from "../model/credentialUrl";

import { PublicAuthShell } from "./PublicAuthShell";
import styles from "./AuthPage.module.css";

/**
 * Sets a new password from an emailed reset link.
 *
 * The token arrives in the URL **fragment**, which browsers never send to a
 * server. It used to be `?token=`, which every server, proxy and trace between
 * the reader and this page recorded — and a reset token is the more dangerous
 * of this application's two emailed credentials, because it takes over an
 * account that already exists.
 *
 * On mount it is read once into a ref and removed from the address bar with
 * `history.replaceState`. After that it exists in one variable, is sent once in
 * a request body, and is never written to storage, a cookie, an analytics call
 * or a log.
 *
 * A successful reset revokes every session on the backend, so the reader is
 * sent to sign in rather than being logged in from the token: auto-login would
 * defeat the revocation that just happened.
 */
type TokenState = "reading" | "present" | "absent";

export function ResetPasswordPage() {
  const router = useRouter();

  /* Not state: this value must never cause a render or appear in a snapshot. */
  const tokenRef = useRef("");
  /* Reading the fragment erases it, so it must happen exactly once — see the
     same guard on the invite page. */
  const consumed = useRef(false);
  const [tokenState, setTokenState] = useState<TokenState>("reading");

  useEffect(() => {
    if (consumed.current) return;
    consumed.current = true;

    tokenRef.current = tokenFromFragment(window.location.hash);
    setTokenState(tokenRef.current ? "present" : "absent");

    /*
      Out of the address bar the moment it has been read — the fragment, and any
      credential in the query string too. A `?token=` link is not accepted here,
      but refusing to read one is not the same as removing it: the rejected URL
      used to stay in the address bar, which is the copy that gets shared.
    */
    scrubLocation();
  }, []);

  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [attempt, setAttempt] = useState(0);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setAttempt((previous) => previous + 1);

    // Mirrors PasswordResetConfirmRequest: 8–72 characters.
    const nextPasswordError =
      password.length >= 8 && password.length <= 72
        ? null
        : "Password must be 8–72 characters.";
    // Checked here because the backend has no second field to compare against.
    const nextConfirmationError =
      password === confirmation ? null : "Passwords do not match.";

    setPasswordError(nextPasswordError);
    setConfirmationError(nextConfirmationError);
    if (nextPasswordError || nextConfirmationError || !tokenRef.current) return;

    setSubmitting(true);
    const outcome = await confirmPasswordReset(tokenRef.current, password);
    setSubmitting(false);

    if (!outcome.ok) {
      setFormError(outcome.error.message);
      return;
    }
    router.replace("/login?reset=success");
  }

  if (tokenState === "reading") {
    return (
      <PublicAuthShell
        title="Set a new password"
        contextTitle="Getting back into your account."
        contextBody="A one-time link restores access. It does not change anything else about your account or your workspace."
        topology="recover"
      >
        <p className={styles.intro}>Checking your link…</p>
      </PublicAuthShell>
    );
  }

  if (tokenState === "absent") {
    return (
      <PublicAuthShell
        title="This link is no longer valid"
        contextTitle="Getting back into your account."
        contextBody="A one-time link restores access. It does not change anything else about your account or your workspace."
        topology="recover"
        footer={<Link href="/login">Back to sign in</Link>}
      >
        <Alert tone="danger">
          This password reset link is no longer valid. Request a new one.
        </Alert>
        <p className={styles.footerLink}>
          <Link href="/forgot-password">Request a new link</Link>
        </p>
      </PublicAuthShell>
    );
  }

  return (
    <PublicAuthShell
      title="Set a new password"
      intro="Choose a password between 8 and 72 characters."
      contextTitle="Getting back into your account."
      contextBody="A one-time link restores access. It does not change anything else about your account or your workspace."
      topology="recover"
      footer={<Link href="/login">Back to sign in</Link>}
    >
      {/* One state for every rejected token: the backend does not say whether
          it was expired, already used or unknown, and neither should this. */}
      <FormErrorSummary
            submission={attempt}
        formError={formError}
        fieldErrors={{
          password: passwordError ?? undefined,
          confirmation: confirmationError ?? undefined,
        }}
        labels={{ password: "New password", confirmation: "Confirm new password" }}
        order={["password", "confirmation"]}
      />

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <Input
          label="New password"
          type="password"
          name="newPassword"
          autoComplete="new-password"
          value={password}
          error={passwordError ?? undefined}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Input
          label="Confirm new password"
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          value={confirmation}
          error={confirmationError ?? undefined}
          onChange={(event) => setConfirmation(event.target.value)}
        />
        <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting}>
          {submitting ? "Resetting password…" : "Set new password"}
        </Button>
      </form>
    </PublicAuthShell>
  );
}
