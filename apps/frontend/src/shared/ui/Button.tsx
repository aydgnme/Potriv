import type { ButtonHTMLAttributes, ReactNode } from "react";

import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Semantic intent, never a styling instruction. */
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly fullWidth?: boolean;
  /**
   * Shows a busy state and blocks further presses. The label stays visible so
   * the button does not change width mid-action.
   */
  readonly loading?: boolean;
  readonly children: ReactNode;
};

/**
 * `primary` is the strongest neutral rather than a colour: these screens are
 * saturated with domain status, and a coloured button would compete with it.
 * `danger` is reserved for genuinely destructive actions.
 */
export function Button({
  variant = "secondary",
  size = "md",
  fullWidth = false,
  loading = false,
  disabled,
  type = "button",
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    styles.button,
    styles[variant],
    styles[size],
    fullWidth ? styles.fullWidth : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      {...rest}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {children}
    </button>
  );
}
