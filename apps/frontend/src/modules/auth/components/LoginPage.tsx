"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";
import { FormErrorSummary } from "@/shared/ui/FormErrorSummary";
import { Input } from "@/shared/ui/Input";

import { signIn } from "../api/authClient";
import { INVALID_CREDENTIALS_MESSAGE } from "../model/errors";

import { PublicAuthShell } from "./PublicAuthShell";
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
        : /*
             "Sign out everywhere" cleared this browser but could not confirm the
             remote revocation. Saying so here — rather than on a page the person
             is no longer signed in to — is the only place the message is both
             true and readable.
          */
          params.get("logout") === "local-only"
          ? "You were signed out of this browser, but we could not confirm that your other sessions were ended."
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
    <PublicAuthShell
      title="Sign in"
      contextTitle="Your workspace, and the work in it."
      contextBody="Potriv keeps project requirements, the people who can meet them, and the staffing decisions between the two in one place."
      topology="signIn"
      footer={
        <>
          New to Potriv? <Link href="/create-workspace">Create your workspace</Link>
        </>
      }
    >
      {notice ? <Alert tone="info">{notice}</Alert> : null}
      {/*
        One alert for whichever way this failed. A credential failure and a
        validation failure cannot happen together here — validation returns
        before the request — but the summary would merge them if they did.
      */}
      <FormErrorSummary
        formError={formError}
        fieldErrors={{ email: emailError ?? undefined, password: passwordError ?? undefined }}
        labels={{ email: "Email", password: "Password" }}
        order={["email", "password"]}
      />

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
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className={styles.footerLink}>
        <Link href="/forgot-password">Forgot password?</Link>
      </p>
    </PublicAuthShell>
  );
}
