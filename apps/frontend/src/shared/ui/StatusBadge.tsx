import styles from "./StatusBadge.module.css";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export type StatusBadgeProps = {
  /**
   * The word the badge shows. Mandatory: colour never carries the meaning on
   * its own, so there is no way to render a badge without one.
   */
  readonly label: string;
  readonly tone?: StatusTone;
};

export function StatusBadge({ label, tone = "neutral" }: StatusBadgeProps) {
  return <span className={[styles.badge, styles[tone]].join(" ")}>{label}</span>;
}
