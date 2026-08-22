"use client";

import { useState } from "react";

import { Alert } from "./Alert";

import styles from "./FormErrorSummary.module.css";

export type FieldErrorMap = Readonly<Record<string, string | undefined>>;

export type FormErrorSummaryProps = {
  /** A failure about the submission as a whole, not about one field. */
  readonly formError?: string | null;
  /** Heading for the form-level failure, in the wording each form already used. */
  readonly title?: string;
  /** Field errors in the shape the action states already carry. */
  readonly fieldErrors?: FieldErrorMap | null;
  /**
   * Field name → the label the form shows. A message like "Required" is useless
   * on its own in a summary; "Project name: Required" is not.
   */
  readonly labels?: Readonly<Record<string, string>>;
  /**
   * Field order, when the object's key order is not the form's visual order.
   * Anything not listed keeps its original position, after the listed keys.
   */
  readonly order?: readonly string[];
  /**
   * Anything that changes per submission attempt. Without it, submitting the
   * same invalid form twice changes no DOM, so the second failure is announced
   * to nobody — a live region reports changes, not intentions.
   *
   * Server-action forms pass their action state, which `useActionState` replaces
   * on every submission. Client-side forms pass a counter they increment when
   * they validate.
   */
  readonly submission?: unknown;
};

/**
 * The one thing a failed submission announces.
 *
 * **The defect this exists for.** Field errors were visible, carried
 * `aria-invalid`, and were associated through `aria-describedby` — and were
 * announced to nobody. A screen-reader user submitted a form, heard silence, and
 * had no way to know the submission had failed short of navigating back through
 * every control. `aria-describedby` is read when focus reaches the control; it is
 * not a status message. That is WCAG 4.1.3, and it was a real failure rather than
 * a limitation of the test environment.
 *
 * **Why a summary rather than live field errors.** Making each field's error
 * live would announce six things at once on a form where six fields can fail,
 * assertively and in no particular order. One region that says what went wrong,
 * once, is both calmer and more useful — and it is the only way to guarantee a
 * single failure is not announced twice.
 *
 * So this renders **exactly one** `role="alert"` (via `Alert`'s `danger` tone)
 * and it is the only live region in a form. The visible per-field messages stay
 * exactly where they are, still referenced by their controls, and are
 * deliberately *not* live.
 *
 * A form-level failure and field errors can arrive together — see
 * `projectActions.ts`, which returns both from one validation result — so both
 * go into the same alert rather than one suppressing the other.
 *
 * **What it does not do.** It does not move focus. A live region tells the
 * person what happened without stealing the caret from wherever they were, and
 * moving focus on every validation update would fight anyone working through a
 * long form.
 *
 * It *does* re-announce a submission that fails a second time with identical
 * text, provided the caller passes `submission`. The region is keyed on the
 * attempt, so a new attempt remounts it and the live region has a change to
 * report. Without that key, resubmitting an unchanged invalid form is silent.
 */
export function FormErrorSummary({
  formError,
  title,
  fieldErrors,
  labels,
  order,
  submission,
}: FormErrorSummaryProps) {
  // Remount on a new attempt so a repeat of the same failure is announced again.
  const [seen, setSeen] = useState(submission);
  const [attempt, setAttempt] = useState(0);
  if (submission !== seen) {
    setSeen(submission);
    setAttempt((previous) => previous + 1);
  }

  const entries = sortEntries(
    Object.entries(fieldErrors ?? {}).filter(
      (entry): entry is [string, string] => Boolean(entry[1]),
    ),
    order,
  );

  if (!formError && entries.length === 0) return null;

  return (
    <Alert key={attempt} tone="danger" title={title ?? headingFor(entries.length)}>
      {formError ? <p>{formError}</p> : null}
      {entries.length > 0 ? (
        <ul className={styles.list}>
          {entries.map(([field, message]) => (
            <li key={field}>{labels?.[field] ? `${labels[field]}: ${message}` : message}</li>
          ))}
        </ul>
      ) : null}
    </Alert>
  );
}

function headingFor(count: number): string | undefined {
  if (count === 0) return undefined;
  return count === 1 ? "Check one field" : `Check ${count} fields`;
}

function sortEntries(
  entries: readonly (readonly [string, string])[],
  order?: readonly string[],
): (readonly [string, string])[] {
  if (!order) return [...entries];
  const rank = (field: string) => {
    const at = order.indexOf(field);
    return at === -1 ? order.length : at;
  };
  return [...entries].sort((a, b) => rank(a[0]) - rank(b[0]));
}
