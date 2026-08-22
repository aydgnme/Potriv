"use client";

import Link from "next/link";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";
import { FormErrorSummary } from "@/shared/ui/FormErrorSummary";
import { Input } from "@/shared/ui/Input";

import { confirmPasswordReset } from "../api/authClient";

import { PublicAuthShell } from "./PublicAuthShell";
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
