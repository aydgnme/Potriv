"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";
import { Input } from "@/shared/ui/Input";

import { signIn } from "../api/authClient";
import { INVALID_CREDENTIALS_MESSAGE } from "../model/errors";

import styles from "./AuthPage.module.css";

/**
 * Sign in.
 *
 * Client-side checks mirror the backend's rules so the obvious mistakes are
 * caught without a round trip, but the backend stays the authority — the form
 * never decides that credentials are valid, only that they are worth sending.
 *
 * Every failed sign-in shows the same message. The backend answers unknown
 * email, wrong password, inactive account and locked account identically so the
 * login form cannot be used to discover which addresses exist; distinguishing
 * them here would hand back exactly that signal.
 */
export function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const notice =
    params.get("session") === "expired"
      ? "Your session has expired. Sign in to continue."
      : params.get("reset") === "success"
        ? "Password updated. Sign in with your new password."
        : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    // Mirrors LoginRequest: a valid address, and 8–72 characters.
    const nextEmailError = /.+@.+\..+/.test(email) ? null : "Enter a valid email address.";
    const nextPasswordError =
      password.length >= 8 && password.length <= 72
        ? null
        : "Password must be 8–72 characters.";

    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    if (nextEmailError || nextPasswordError) return;

    setSubmitting(true);
    const outcome = await signIn(email, password);
    setSubmitting(false);

    if (!outcome.ok) {
      // The typed email is deliberately kept: making someone retype it after a
      // recoverable error is a small cruelty.
      setFormError(outcome.error.message || INVALID_CREDENTIALS_MESSAGE);
      return;
    }

    router.replace("/home");
    router.refresh();
  }

  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <div className={styles.identity}>
          {/* The page's only heading. It was a `span`, which left the sign-in
              screen with no heading at all — nothing for a screen reader to
              land on, and no name for the one thing the page does. */}
          <h1 className={styles.wordmark}>Potriv</h1>
          <p className={styles.tagline}>Team allocation and skill matching</p>
        </div>

        {notice ? <Alert tone="info">{notice}</Alert> : null}
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
          <Input
            label="Password"
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            error={passwordError ?? undefined}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting}>
            Sign in
          </Button>
        </form>

        <div className={styles.footer}>
          <a href="/forgot-password">Forgot password?</a>
        </div>
      </main>
    </div>
  );
}
