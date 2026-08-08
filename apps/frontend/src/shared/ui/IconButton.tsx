import type { ButtonHTMLAttributes, ReactNode } from "react";

import styles from "./IconButton.module.css";

export type IconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "aria-label"
> & {
  /** Required: an icon alone tells assistive technology nothing. */
  readonly label: string;
  readonly icon: ReactNode;
  readonly size?: "sm" | "md";
};

/** An icon-only control. The label is mandatory by type, not by convention. */
export function IconButton({
  label,
  icon,
  size = "md",
  type = "button",
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      title={label}
      className={[styles.iconButton, styles[size], className].filter(Boolean).join(" ")}
    >
      {icon}
    </button>
  );
}
