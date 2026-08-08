import { useId } from "react";
import type { ReactNode, SelectHTMLAttributes } from "react";

import styles from "./Field.module.css";

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> & {
  readonly label: string;
  readonly hint?: ReactNode;
  readonly error?: string;
  readonly requirement?: "Required" | "Optional";
  readonly children: ReactNode;
};

export function Select({ label, hint, error, requirement, children, ...rest }: SelectProps) {
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
      <select
        {...rest}
        id={id}
        className={[styles.control, error ? styles.invalid : null].filter(Boolean).join(" ")}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
      >
        {children}
      </select>
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
