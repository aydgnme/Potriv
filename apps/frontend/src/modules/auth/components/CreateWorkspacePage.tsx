"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Alert } from "@/shared/ui/Alert";

import { createWorkspace } from "../api/authClient";
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  validateWorkspaceRegistration,
  type WorkspaceFieldErrors,
} from "../model/workspaceRegistration";

import styles from "./CreateWorkspacePage.module.css";

/**
 * Create a workspace: one organization and its first administrator.
 *
 * The scope is deliberately one step. It creates the organization and stops —
 * departments, team roles, the skill catalogue and invitations are all real
 * work the administrator does inside the product, and a wizard that pretended
 * to do them here would be inventing behaviour the backend does not offer.
 *
 * There is no auto-login, because `POST /auth/register-admin` returns no tokens.
 * Faking one would mean replaying the password against the login endpoint behind
 * the user's back. The success state says what actually happened and sends them
 * to sign in.
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
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

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

    setCreatedEmail(outcome.email);
  }

  if (createdEmail) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <div className={styles.success}>
            <CheckMark className={styles.successMark} />
            <h1 className={styles.title}>Workspace created</h1>
            <p className={styles.successBody}>
              Your organization exists and <strong>{createdEmail}</strong> is its
              administrator. Sign in to add departments, team roles and the
              people who will work in it.
            </p>
            <div className={styles.successActions}>
              <Link className={styles.successPrimary} href="/login">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <Link className={styles.wordmark} href="/">
          POTRIV
        </Link>
        <h1 className={styles.title}>Create your workspace</h1>
        <p className={styles.intro}>
          This creates one organization and you as its administrator. Everything
          else — departments, skills, projects — you set up inside it afterwards.
        </p>

        {/* Alert announces the `danger` tone assertively on its own. */}
        {formError ? <Alert tone="danger">{formError}</Alert> : null}

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

        <p className={styles.footerNote}>
          Already have a workspace? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </main>
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
