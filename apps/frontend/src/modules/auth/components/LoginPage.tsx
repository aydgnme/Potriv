"use client";

import { useState, type FormEvent } from "react";

import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";
import { Input } from "@/shared/ui/Input";

import styles from "./LoginPage.module.css";

/**
 * The sign-in screen's structure and design.
 *
 * **Deliberately not connected to a session.** FE-02 owns authentication, so
 * this submits nowhere: no request, no token, no storage, and explicitly not the
 * developer console's `tokenStore`. Faking a session here would have to be
 * unpicked rather than extended.
 *
 * What it does establish is everything the real flow will need around the
 * request — labelled controls, a busy state that survives a slow call, and an
 * error region that is announced rather than merely displayed.
 */
export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    // FE-02 replaces this with the real sign-in call. Saying so is more honest
    // than a placeholder that looks like it worked.
    setError("Sign-in is not connected yet.");
    setSubmitting(false);
  }

  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <div className={styles.identity}>
          <span className={styles.wordmark}>Potriv</span>
          <span className={styles.tagline}>Team allocation and skill matching</span>
        </div>

        {error ? <Alert tone="danger">{error}</Alert> : null}

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <Input
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Input
            label="Password"
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
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
