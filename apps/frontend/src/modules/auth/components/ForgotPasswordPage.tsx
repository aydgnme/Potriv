"use client";

import Link from "next/link";

import { useState, type FormEvent } from "react";

import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";
import { FormErrorSummary } from "@/shared/ui/FormErrorSummary";
import { Input } from "@/shared/ui/Input";

import { requestPasswordReset } from "../api/authClient";

import { PublicAuthShell } from "./PublicAuthShell";
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
  const [attempt, setAttempt] = useState(0);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setAttempt((previous) => previous + 1);

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
    <PublicAuthShell
      title="Reset your password"
      intro={
        submitted
          ? undefined
          : "Enter the email address used for your Potriv account."
      }
      contextTitle="Getting back into your account."
      contextBody="A one-time link restores access. It does not change anything else about your account or your workspace."
      topology="recover"
      footer={<Link href="/login">Back to sign in</Link>}
    >
      {submitted ? (
        <>
          {/*
            Deliberately neutral. The backend answers the same way whether or
            not the address exists, so saying anything more specific here would
            hand back the enumeration signal it refuses to give.
          */}
          <Alert tone="info">
            If an account exists for this email, a password reset link has been sent.
          </Alert>
          <p className={styles.intro}>
            The link is valid for 30 minutes. Check your spam folder if it does not
            arrive.
          </p>
        </>
      ) : (
        <>
          <FormErrorSummary
            submission={attempt}
            formError={formError}
            fieldErrors={{ email: emailError ?? undefined }}
            /* Exactly the visible label. A summary that renames the field sends
               a speech-input user looking for a "Work email" box that is not
               on the page. */
            labels={{ email: "Email" }}
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
            <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting}>
              {submitting ? "Sending reset link…" : "Send reset link"}
            </Button>
          </form>
        </>
      )}
    </PublicAuthShell>
  );
}
