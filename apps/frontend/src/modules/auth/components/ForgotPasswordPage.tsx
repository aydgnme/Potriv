"use client";

import { useState, type FormEvent } from "react";

import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";
import { Input } from "@/shared/ui/Input";

import { requestPasswordReset } from "../api/authClient";

import styles from "./AuthPage.module.css";

/**
 * Requests a password reset link.
 *
 * The confirmation is identical whether or not an account exists. The backend
 * answers 202 either way precisely so this form cannot be used to check which
 * addresses are registered, and the wording here has to hold that line — "we
 * have sent you a link" would quietly break it.
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const nextEmailError = /.+@.+\..+/.test(email) ? null : "Enter a valid email address.";
    setEmailError(nextEmailError);
    if (nextEmailError) return;

    setSubmitting(true);
    const outcome = await requestPasswordReset(email);
    setSubmitting(false);

    if (!outcome.ok) {
      setFormError(outcome.error.message);
      return;
    }
    setSubmitted(true);
  }

  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <div className={styles.identity}>
          <span className={styles.wordmark}>Potriv</span>
        </div>

        {submitted ? (
          <>
            <Alert tone="info">
              If an account exists for this email, a password reset link has been sent.
            </Alert>
            <p className={styles.intro}>
              The link is valid for 30 minutes. Check your spam folder if it does not
              arrive.
            </p>
            <div className={styles.footer}>
              <a href="/login">Back to sign in</a>
            </div>
          </>
        ) : (
          <>
            <div>
              <h1 className={styles.heading}>Reset your password</h1>
              <p className={styles.intro}>
                Enter your email and we will send you a link to set a new password.
              </p>
            </div>

            {formError ? <Alert tone="danger">{formError}</Alert> : null}

            <form className={styles.form} onSubmit={handleSubmit} noValidate>
              <Input
                label="Email"
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                error={emailError ?? undefined}
                onChange={(event) => setEmail(event.target.value)}
              />
              <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting}>
                Send reset link
              </Button>
            </form>

            <div className={styles.footer}>
              <a href="/login">Back to sign in</a>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
