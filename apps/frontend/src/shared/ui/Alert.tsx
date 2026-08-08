import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";

import styles from "./Alert.module.css";

export type AlertTone = "info" | "success" | "warning" | "danger";

export type AlertProps = {
  readonly tone?: AlertTone;
  readonly title?: string;
  readonly children: ReactNode;
};

const ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
} as const;

/**
 * An icon accompanies the colour so the tone survives for anyone who cannot see
 * it. `danger` is announced assertively because it usually reports a failed
 * action the user is waiting on.
 */
export function Alert({ tone = "info", title, children }: AlertProps) {
  const Icon = ICONS[tone];

  return (
    <div
      className={[styles.alert, styles[tone]].join(" ")}
      role={tone === "danger" ? "alert" : "status"}
    >
      <Icon className={styles.icon} size={16} aria-hidden="true" />
      <div className={styles.body}>
        {title ? <strong className={styles.title}>{title}</strong> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}
