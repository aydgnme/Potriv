import { OPERATING_PROBLEM } from "../../businessPlan";
import { LEDGER_STATES } from "../../homeModel";
import home from "../../styles/home.module.css";

/**
 * The four things a staffing decision needs, as a ledger rather than prose.
 *
 * Each row reads across: what a decision is missing on the left, the object
 * Potriv answers it with on the right, a rule between them. The pairing is the
 * argument, and stacked paragraphs cannot make it — reading "two people
 * describing the same ability do not match" straight across to "a shared
 * vocabulary for skills" is what shows the product answering something.
 *
 * Both halves come from `OPERATING_PROBLEM.gaps`, which is where those four
 * claims live. The `body` is the condition and the `title` is the object, so
 * this arranges the canonical copy rather than restating it.
 *
 * A definition list, because that is what it is: a condition and what resolves
 * it. The association survives with no stylesheet at all.
 */
export function EvidenceLedger() {
  return (
    <dl className={home.ledger}>
      {OPERATING_PROBLEM.gaps.map((gap, index) => (
        <div className={home.ledgerRow} key={gap.title}>
          <span className={home.ledgerNumber} aria-hidden="true">
            {String(index + 1).padStart(2, "0")}
          </span>

          <dt className={home.ledgerProblem}>{gap.body}</dt>

          {/* The join. Decorative: the pairing is already in the markup. */}
          <span className={home.ledgerJoin} aria-hidden="true" />

          <dd className={home.ledgerAnswer}>
            <span className={home.ledgerAnswerTitle}>{gap.title}</span>
            <span className={home.ledgerState}>{LEDGER_STATES[index]}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
