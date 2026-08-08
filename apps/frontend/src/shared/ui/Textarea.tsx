import { useId } from "react";
import type { ReactNode, TextareaHTMLAttributes } from "react";

import styles from "./Field.module.css";

export type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & {
  readonly label: string;
  readonly hint?: ReactNode;
  readonly error?: string;
  readonly requirement?: "Required" | "Optional";
};

export function Textarea({ label, hint, error, requirement, ...rest }: TextareaProps) {
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
      <textarea
        {...rest}
        id={id}
        className={[styles.control, styles.textarea, error ? styles.invalid : null]
          .filter(Boolean)
          .join(" ")}
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
