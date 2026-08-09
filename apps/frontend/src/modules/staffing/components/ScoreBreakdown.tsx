import type { CandidateScore } from "../model/teamFinderData";

import styles from "./TeamFinder.module.css";

export type ScoreBreakdownProps = {
  readonly score: CandidateScore;
};

/**
 * How a candidate reached their number.
 *
 * Every value is rendered exactly as the backend returned it — nothing here
 * recomputes a component or re-derives the total. The ranking is deterministic
 * arithmetic over declared facts, so the arithmetic is what gets shown: a total
 * on its own would be a verdict, and this is not a verdict.
 *
 * No gauge, no grade, no traffic light. Four numbers and their maximums.
 */
const COMPONENTS = [
  { key: "skillScore", label: "Matched skills", max: 60 },
  { key: "pastProjectScore", label: "Past project matches", max: 20 },
  { key: "availabilityScore", label: "Availability", max: 20 },
] as const;

export function ScoreBreakdown({ score }: ScoreBreakdownProps) {
  return (
    <dl className={styles.score}>
      {COMPONENTS.map((component) => (
        <div key={component.key} className={styles.scoreRow}>
          <dt>{component.label}</dt>
          <dd>{`${score[component.key]} / ${component.max}`}</dd>
        </div>
      ))}
      <div className={[styles.scoreRow, styles.scoreTotal].join(" ")}>
        <dt>Total</dt>
        <dd>{`${score.totalScore} / 100`}</dd>
      </div>
    </dl>
  );
}
