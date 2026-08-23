import styles from "../../styles/plan.module.css";

/**
 * A two-column ledger: what is wrong on the left, what Potriv does on the right.
 *
 * A definition list rather than a table, because each row is one term and its
 * answer rather than a cell in a grid — and because a `<dl>` stacks on a phone
 * without losing which half is which.
 */
export function Ledger({
  rows,
}: {
  readonly rows: readonly { readonly problem: string; readonly response: string; readonly object: string }[];
}) {
  return (
    <dl className={styles.ledger}>
      {rows.map((row) => (
        <div className={styles.ledgerRow} key={row.problem}>
          <dt className={styles.ledgerTerm}>{row.problem}</dt>
          <dd className={styles.ledgerDetail}>
            <span className={styles.ledgerResponse}>{row.response}</span>
            <span className={styles.ledgerObject}>{row.object}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
