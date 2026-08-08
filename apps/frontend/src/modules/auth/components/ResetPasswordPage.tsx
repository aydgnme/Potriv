"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";
import { Input } from "@/shared/ui/Input";

import { confirmPasswordReset } from "../api/authClient";

import styles from "./AuthPage.module.css";

/**
 * Sets a new password from an emailed reset link.
 *
 * The token is read from the URL, sent once, and never written anywhere — not to
 * storage, not to a cookie, not to a log. A successful reset revokes every
 * session on the backend, so the user is sent to sign in rather than being
 * logged in from the token: auto-login would defeat the revocation that just
 * happened.
 */
export function ResetPasswordPage() {
  const router = useRouter();
  const token = useSearchParams().get("token");

  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

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
    if (nextPasswordError || nextConfirmationError || !token) return;

    setSubmitting(true);
    const outcome = await confirmPasswordReset(token, password);
    setSubmitting(false);

    if (!outcome.ok) {
      setFormError(outcome.error.message);
      return;
    }
    router.replace("/login?reset=success");
  }

  if (!token) {
    return (
      <div className={styles.page}>
        <main className={styles.card}>
          <div className={styles.identity}>
            <span className={styles.wordmark}>Potriv</span>
          </div>
          <Alert tone="danger">
            This password reset link is no longer valid. Request a new one.
          </Alert>
          <div className={styles.footer}>
            <a href="/forgot-password">Request a new link</a>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <div className={styles.identity}>
          <span className={styles.wordmark}>Potriv</span>
        </div>

        <div>
          <h1 className={styles.heading}>Set a new password</h1>
          <p className={styles.intro}>
            Choose a password between 8 and 72 characters.
          </p>
        </div>

        {/* One state for every rejected token: the backend does not say whether
            it was expired, already used or unknown, and neither should this. */}
        {formError ? <Alert tone="danger">{formError}</Alert> : null}

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
            Set new password
          </Button>
        </form>

        <div className={styles.footer}>
          <a href="/login">Back to sign in</a>
        </div>
      </main>
    </div>
  );
}
