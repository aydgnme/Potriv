"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Alert } from "@/shared/ui/Alert";
import { FormErrorSummary } from "@/shared/ui/FormErrorSummary";
import { Button } from "@/shared/ui/Button";
import { Input } from "@/shared/ui/Input";

import { registerWithInvite } from "../api/authClient";
import {
  INVITE_PASSWORD_MAX,
  INVITE_PASSWORD_MIN,
  validateInviteRegistration,
  type InviteFieldErrors,
} from "../model/inviteRegistration";

import { PublicAuthShell } from "./PublicAuthShell";
import styles from "./AuthPage.module.css";

/**
 * Join a workspace by invitation.
 *
 * The token stays in the URL. Only a boolean saying whether one is present
 * crosses the server/client boundary, because a prop handed to a client
 * component is serialised into the RSC payload embedded in the HTML — which
 * would put the token in the document as well as the address bar. It is read
 * from `window.location` at submit time, sent once, and never rendered, stored,
 * or echoed in an error.
 *
 * There is **no way to check a token before submitting**: the backend exposes no
 * endpoint that reports whether an invite is usable, and inventing one would
 * mean either guessing or adding a backend surface this slice has no mandate
 * for. So the form renders for any token and invalidity surfaces on submit. The
 * alternative — pretending to validate — would be worse than the wait.
 *
 * Whatever killed an invite, the reader is told the same sentence. The backend
 * separates "never existed" (404) from "expired or revoked" (400); repeating
 * that split here would let anyone with a guessed token learn whether it was
 * ever real.
 */

/**
 * Reads the invite token from the address bar at the moment it is spent.
 *
 * Deliberately not a prop, not state and not a ref: anything held in React would
 * be serialised into the page payload or survive past the one request that needs
 * it. Read, sent, forgotten.
 */
function readTokenFromUrl(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("token") ?? "";
}

export function InvitePage({ hasToken }: { readonly hasToken: boolean }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<InviteFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [inviteDead, setInviteDead] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const validated = validateInviteRegistration({ name, email, password });
    if (!validated.ok) {
      setFieldErrors(validated.errors);
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    const outcome = await registerWithInvite({
      token: readTokenFromUrl(),
      ...validated.value,
    });
    setSubmitting(false);

    if (!outcome.ok) {
      if (outcome.code === "INVITE_INVALID") {
        // Replaces the form entirely: there is nothing useful to retype.
        setInviteDead(true);
        return;
      }
      if (outcome.fieldErrors) setFieldErrors(outcome.fieldErrors);
      setFormError(outcome.message);
      return;
    }

    setCreatedEmail(outcome.email);
  }

  const context = {
    contextTitle: "An invitation to a workspace.",
    contextBody:
      "Creating your account adds you to the workspace that invited you. What you can see and do there is decided by that organization.",
    topology: "invite",
  } as const;

  if (inviteDead || !hasToken) {
    return (
      <PublicAuthShell title="This invite is no longer valid" {...context}>
        <Alert tone="danger">
          Ask your organization administrator for a new invite link.
        </Alert>
        <p className={styles.footerLink}>
          <Link href="/login">Sign in</Link>
        </p>
      </PublicAuthShell>
    );
  }

  if (createdEmail) {
    return (
      <PublicAuthShell title="Your account is ready" {...context}>
        <Alert tone="success">
          The account <strong>{createdEmail}</strong> was created.
        </Alert>
        <p className={styles.intro}>
          Sign in to see the projects and skills you have been given access to.
        </p>
        <p className={styles.footerLink}>
          <Link href="/login">Sign in</Link>
        </p>
      </PublicAuthShell>
    );
  }

  return (
    <PublicAuthShell
      title="Join a Potriv workspace"
      /* The organization is deliberately unnamed. The backend gives no safe way
         to resolve an invite to an organization before registration, and naming
         one would either be invented or would confirm that a guessed token
         belongs to a real workspace. */
      intro="You've been invited to join a Potriv workspace. Create your account to continue."
      {...context}
      footer={
        <>
          Already have an account? <Link href="/login">Sign in</Link>
        </>
      }
    >
      <FormErrorSummary
        formError={formError}
        fieldErrors={fieldErrors}
        labels={{ name: "Your name", email: "Work email", password: "Password" }}
        order={["name", "email", "password"]}
      />

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <Input
          label="Your name"
          type="text"
          name="name"
          autoComplete="name"
          value={name}
          error={fieldErrors.name}
          onChange={(event) => setName(event.target.value)}
        />
        <Input
          label="Work email"
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          error={fieldErrors.email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Input
          label="Password"
          type="password"
          name="password"
          autoComplete="new-password"
          hint={`${INVITE_PASSWORD_MIN}–${INVITE_PASSWORD_MAX} characters.`}
          value={password}
          error={fieldErrors.password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </PublicAuthShell>
  );
}
