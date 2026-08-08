import { useId } from "react";
import type { InputHTMLAttributes } from "react";

import styles from "./Field.module.css";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type"> & {
  readonly label: string;
  readonly description?: string;
};

/**
 * A checkbox with a real label. `description` explains what the option does —
 * used, for example, to describe a role by capability rather than by name.
 */
export function Checkbox({ label, description, ...rest }: CheckboxProps) {
  const id = useId();
  const descriptionId = `${id}-description`;

  return (
    <div className={styles.field}>
      <div className={styles.checkboxRow}>
        <input
          {...rest}
          type="checkbox"
          id={id}
          className={styles.checkbox}
          aria-describedby={description ? descriptionId : undefined}
        />
        <label className={styles.label} htmlFor={id}>
          {label}
        </label>
      </div>
      {description ? (
        <span id={descriptionId} className={styles.hint}>
          {description}
        </span>
      ) : null}
    </div>
  );
}
