"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { FormErrorSummary } from "@/shared/ui/FormErrorSummary";

import { createWorkspace } from "../api/authClient";
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  validateWorkspaceRegistration,
  type WorkspaceFieldErrors,
} from "../model/workspaceRegistration";

import { PublicAuthShell } from "./PublicAuthShell";
import styles from "./CreateWorkspacePage.module.css";

/**
 * Requests a workspace: one organization and its first administrator, pending
 * confirmation of the email address.
 *
 * The scope of what gets created is deliberately one step — departments, team
 * roles, the skill catalogue and invitations are all real work the
 * administrator does inside the product, and a wizard that pretended to do
 * them here would be inventing behaviour the backend does not offer.
 *
 * Submitting no longer creates anything by itself: `POST /auth/register-admin`
 * answers 202 identically whether or not the address already has an account,
 * so the response here cannot say "created" — only that a confirmation link
 * has been sent, worded exactly like the password-reset request's own
 * deliberately neutral confirmation. The organization and the administrator
 * account are created when that link is opened; see `ConfirmWorkspacePage`.
 */

const FIELDS = [
  {
    name: "name",
    label: "Your name",
    type: "text",
    autoComplete: "name",
    hint: null,
  },
  {
    name: "email",
    label: "Work email",
    type: "email",
    autoComplete: "email",
    hint: "You will sign in with this address.",
  },
  {
    name: "password",
    label: "Password",
    type: "password",
    autoComplete: "new-password",
    hint: `${PASSWORD_MIN}–${PASSWORD_MAX} characters.`,
  },
  {
    name: "organizationName",
    label: "Organization name",
    type: "text",
    autoComplete: "organization",
    hint: null,
  },
  {
    name: "headquarterAddress",
    label: "Headquarters address",
    type: "text",
    autoComplete: "street-address",
    hint: null,
  },
] as const;

type FieldName = (typeof FIELDS)[number]["name"];

const EMPTY: Record<FieldName, string> = {
  name: "",
  email: "",
  password: "",
  organizationName: "",
  headquarterAddress: "",
};

export function CreateWorkspacePage() {
  const [values, setValues] = useState<Record<FieldName, string>>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<WorkspaceFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setAttempt((previous) => previous + 1);

    // The same pure validator the route handler runs, so the two cannot drift.
    const validated = validateWorkspaceRegistration(values);
    if (!validated.ok) {
      setFieldErrors(validated.errors);
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    const outcome = await createWorkspace(validated.value);
    setSubmitting(false);

    if (!outcome.ok) {
      if (outcome.fieldErrors) setFieldErrors(outcome.fieldErrors);
      setFormError(outcome.error.message);
      return;
    }

    setSubmittedEmail(validated.value.email);
  }

  if (submittedEmail) {
    return (
      <PublicAuthShell
        title="Check your email"
        contextTitle="One organization, and its first administrator."
        contextBody="Everything else — departments, skills, projects — is set up inside the workspace afterwards."
        topology="createWorkspace"
        footer={<Link href="/login">Back to sign in</Link>}
      >
        <div className={styles.success}>
          <CheckMark className={styles.successMark} />
          {/*
            Deliberately neutral, and worded like the password-reset request's
            own confirmation: the backend answers the same way whether or not
            the address already has an account, so this cannot say "created"
            without handing back the enumeration signal it refuses to give.
          */}
          <p className={styles.successBody}>
            If <strong>{submittedEmail}</strong> can be used to create a
            workspace, a confirmation link has been sent to it. Open it to
            finish creating the organization and its administrator account.
          </p>
        </div>
      </PublicAuthShell>
    );
  }

  return (
    <PublicAuthShell
      title="Create your workspace"
      intro="This creates one organization and you as its administrator."
      contextTitle="One organization, and its first administrator."
      contextBody="Everything else — departments, skills, projects — is set up inside the workspace afterwards."
      topology="createWorkspace"
      footer={
        <>
          Already have a workspace? <Link href="/login">Sign in</Link>
        </>
      }
    >
      {/* Alert announces the `danger` tone assertively on its own. */}
      {/* Five fields can fail at once here, which is exactly why this is one
          summary rather than five live field errors. Labels and order come from
          the same FIELDS array the form renders from, so a summary line can
          never name a field differently from its label. */}
      <FormErrorSummary
        submission={attempt}
        formError={formError}
        fieldErrors={fieldErrors}
        labels={Object.fromEntries(FIELDS.map((field) => [field.name, field.label]))}
        order={FIELDS.map((field) => field.name)}
      />

      <form onSubmit={handleSubmit} noValidate>
        <div className={styles.fields}>
          {FIELDS.map((field) => {
            const errorId = `${field.name}-error`;
            const hintId = `${field.name}-hint`;
            const error = fieldErrors[field.name];
            return (
              <div className={styles.field} key={field.name}>
                <label className={styles.label} htmlFor={field.name}>
                  {field.label}
                </label>
                {field.hint ? (
                  <span className={styles.hint} id={hintId}>
                    {field.hint}
                  </span>
                ) : null}
                <input
                  className={styles.input}
                  id={field.name}
                  name={field.name}
                  type={field.type}
                  autoComplete={field.autoComplete}
                  value={values[field.name]}
                  onChange={(event) =>
                    setValues((previous) => ({
                      ...previous,
                      [field.name]: event.target.value,
                    }))
                  }
                  aria-invalid={error ? true : undefined}
                  aria-describedby={
                    [error ? errorId : null, field.hint ? hintId : null]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                />
                {error ? (
                  <span className={styles.fieldError} id={errorId}>
                    {error}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>

        <button className={styles.submit} type="submit" disabled={submitting}>
          {submitting ? "Creating workspace…" : "Create workspace"}
        </button>
      </form>
    </PublicAuthShell>
  );
}

function CheckMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="28"
      height="28"
      viewBox="0 0 28 28"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="14" cy="14" r="13" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 14.5l4 4 8-8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
