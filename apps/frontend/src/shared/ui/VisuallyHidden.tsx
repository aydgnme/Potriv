import type { ReactNode } from "react";

import styles from "./VisuallyHidden.module.css";

export type VisuallyHiddenProps = {
  readonly children: ReactNode;
};

/**
 * Text that only assistive technology reads.
 *
 * Used where a control is legible to the eye by other means — an icon in a
 * collapsed rail, a bar whose current item is obvious visually — but would
 * otherwise reach a screen reader unnamed. It is not a place to hide things:
 * whatever is in here is part of the accessible name and must be true.
 *
 * Shared because collapsing labels is a shell concern that several surfaces
 * need identically, and a second copy of the clip technique is a second chance
 * to get it subtly wrong.
 */
export function VisuallyHidden({ children }: VisuallyHiddenProps) {
  return <span className={styles.visuallyHidden}>{children}</span>;
}
