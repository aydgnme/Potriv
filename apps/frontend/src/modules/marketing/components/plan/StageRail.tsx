import styles from "../../styles/plan.module.css";

/**
 * The five stages as a rail.
 *
 * Numbered and ruled rather than boxed: the point is that they follow one
 * another, and a row of separate cards says the opposite.
 */
export function StageRail({
  stages,
}: {
  readonly stages: readonly { readonly number: string; readonly name: string; readonly body: string }[];
}) {
  return (
    <ol className={styles.rail}>
      {stages.map((stage) => (
        <li className={styles.railStage} key={stage.number}>
          <span className={styles.railNumber}>{stage.number}</span>
          <h3 className={styles.railName}>{stage.name}</h3>
          <p className={styles.railBody}>{stage.body}</p>
        </li>
      ))}
    </ol>
  );
}
