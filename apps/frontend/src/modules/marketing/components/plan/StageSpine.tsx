import { OPERATING_MODEL } from "../../businessPlan";
import styles from "../../styles/plan.module.css";

/**
 * The five stages, vertically, as the hero's demonstration.
 *
 * The desktop hero was a headline against an empty right half, so the first
 * viewport asked somebody to create a workspace before showing them anything
 * the product does. This puts the model there instead: requirement, evidence,
 * ranked candidates, review, allocation, with the rule that only the last one
 * means somebody is on a team.
 *
 * It reveals once on load, stage by stage, and then stops. The motion is doing
 * a job — it says these happen in an order — and it is CSS only: no script, no
 * client boundary, and the complete final state is what the server sends. If
 * animation never runs, or `prefers-reduced-motion` is set, the reader gets
 * that final state immediately and loses nothing.
 */
export function StageSpine() {
  return (
    <ol className={styles.spine} aria-label="How a requirement becomes an allocation">
      {OPERATING_MODEL.stages.map((stage, index) => (
        <li
          className={styles.spineStage}
          key={stage.number}
          /* Each stage waits for the one above it. Custom property rather than
             a class per index, so adding a stage needs no new CSS. */
          style={{ "--stage-index": index } as React.CSSProperties}
        >
          <span className={styles.spineMark} aria-hidden="true" />
          <span className={styles.spineNumber}>{stage.number}</span>
          <span className={styles.spineName}>{stage.name}</span>
        </li>
      ))}
    </ol>
  );
}
