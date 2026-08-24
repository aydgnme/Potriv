"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";
import { FormErrorSummary } from "@/shared/ui/FormErrorSummary";
import { Input } from "@/shared/ui/Input";

import { registerWithInvite } from "../api/authClient";
import { scrubLocation, tokenFromFragment } from "../model/credentialUrl";
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
 * The token arrives in the URL **fragment**, which the browser never sends to
 * any server. It therefore never crosses the server/client boundary at all:
 * nothing about it is in the RSC payload, because the server never saw it.
 *
 * On mount the fragment is read once into a ref and then removed from the
 * address bar with `history.replaceState`. After that the token exists in
 * exactly one place — a variable in this component — and disappears when the
 * page does. It is never rendered, never put in a form field, never written to
 * `localStorage`, `sessionStorage`, a cookie or an analytics call, and never
 * echoed back in an error.
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
 * Whether the fragment has been read yet. The first render happens before the
 * effect runs, and the token is not knowable then — rendering "this invite is
 * no longer valid" during that gap would tell every legitimate recipient their
 * link is broken for one frame.
 */
type TokenState = "reading" | "present" | "absent";

export function InvitePage({ authenticated }: { readonly authenticated: boolean }) {
  const router = useRouter();

  /* Not state: this value must never cause a render, appear in a snapshot, or
     be read by anything except the submit handler. */
  const tokenRef = useRef("");
  /**
   * Reading the fragment is destructive — the next line erases it — so it must
   * happen exactly once. An effect is not guaranteed to run once: React invokes
   * it twice in development to surface exactly this class of bug, and any
   * unstable dependency re-runs it in production. A second run would read an
   * empty fragment and conclude the link was broken.
   */
  const consumed = useRef(false);
  const [tokenState, setTokenState] = useState<TokenState>("reading");

  useEffect(() => {
    if (consumed.current) return;
    consumed.current = true;

    tokenRef.current = tokenFromFragment(window.location.hash);
    setTokenState(tokenRef.current ? "present" : "absent");

    /**
     * Out of the address bar immediately — the fragment and any credential in
     * the query string, whether or not this page would have accepted it.
     *
     * Not because a fragment travels; it does not. Because an address bar is
     * shared in ways a request never is: a screenshot, a screen share, a
     * bookmark, browser sync, someone reading over a shoulder.
     */
    scrubLocation();

    /*
      Only now is it safe to send a signed-in reader on. Redirecting before this
      point — which is what the server used to do — carries the fragment to the
      destination, because a browser reattaches it when the target has none.
    */
    if (authenticated) router.replace("/home");
  }, [authenticated, router]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<InviteFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [inviteDead, setInviteDead] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setAttempt((previous) => previous + 1);

    const validated = validateInviteRegistration({ name, email, password });
    if (!validated.ok) {
      setFieldErrors(validated.errors);
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    const outcome = await registerWithInvite({
      token: tokenRef.current,
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

  if (authenticated) {
    /*
      Already signed in, and on the way to /home. The form is never rendered
      here: registering would create a second account, and the backend would
      reject the address anyway. This state exists so the redirect has something
      to show rather than a flash of an invitation form.
    */
    return (
      <PublicAuthShell title="You are already signed in" {...context}>
        <p className={styles.intro}>Taking you to your workspace…</p>
      </PublicAuthShell>
    );
  }

  if (tokenState === "reading") {
    return (
      <PublicAuthShell title="Join a Potriv workspace" {...context}>
        <p className={styles.intro}>Checking your invitation…</p>
      </PublicAuthShell>
    );
  }

  if (inviteDead || tokenState === "absent") {
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
            submission={attempt}
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
