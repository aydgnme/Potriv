import { useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

import styles from "./Field.module.css";

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  readonly label: string;
  readonly hint?: ReactNode;
  /** Present means invalid: the message is announced and linked to the control. */
  readonly error?: string;
  readonly requirement?: "Required" | "Optional";
};

/**
 * A labelled text input. The label is a real `<label>` — a placeholder is never
 * used as one — and any error is associated through `aria-describedby` rather
 * than merely sitting nearby.
 */
export function Input({ label, hint, error, requirement, ...rest }: InputProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {requirement ? <span className={styles.requirement}>{requirement}</span> : null}
      </label>
      <input
        {...rest}
        id={id}
        className={[styles.control, error ? styles.invalid : null].filter(Boolean).join(" ")}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
      />
      {hint ? (
        <span id={hintId} className={styles.hint}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className={styles.error}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
