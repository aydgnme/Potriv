import Link from "next/link";

import { CONTINUATION } from "../../businessPlan";
import styles from "../../styles/plan.module.css";

/**
 * Where this chapter leads, and why.
 *
 * The link text used to be the word "Next", which says nothing about whether
 * the reader should follow it. It carries the reason now — and the sequence is
 * linear, so the last chapter has no continuation at all rather than wrapping
 * back to the first.
 */
export function Continuation({ from }: { readonly from: string }) {
  const next = CONTINUATION[from];
  if (!next) return null;

  return (
    <nav className={styles.continuation} aria-label="Continue the plan">
      <div className={styles.container}>
        <p className={styles.continuationBecause}>{next.because}</p>
        <Link className={styles.continuationLink} href={next.href}>
          {`Continue to ${next.label}`}
        </Link>
      </div>
    </nav>
  );
}
