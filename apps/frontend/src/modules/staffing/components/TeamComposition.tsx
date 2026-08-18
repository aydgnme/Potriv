import type { RequirementComposition } from "../utils/openRequirements";

import styles from "./TeamFinder.module.css";

export type TeamCompositionProps = {
  readonly composition: readonly RequirementComposition[];
  /** True when the team read did not answer, so proposals are unknown. */
  readonly proposedUnavailable: boolean;
};

/**
 * What this project asked for, against what it actually has.
 *
 * Four counts of **people**, every one of them from the backend. The rule the
 * table exists to state plainly:
 *
 * ```
 * Open = Needed − Active
 * ```
 *
 * Proposals are counted and shown, and they never reduce Open. A proposal is a
 * request a department manager has not answered yet; nobody is on the project
 * because of one. A role needing three with one allocated and two proposed still
 * has two positions open, and saying otherwise would report the gap as nearly
 * closed on the strength of decisions nobody has made.
 *
 * No percentage, no donut, no staffing health. The backend has no such concept,
 * and the four numbers are what a manager acts on.
 */
export function TeamComposition({ composition, proposedUnavailable }: TeamCompositionProps) {
  if (composition.length === 0) {
    return (
      <p className={styles.panelNote}>
        No role requirements declared. Skills still match on technologies; past-project
        similarity has no roles to compare against.
      </p>
    );
  }

  return (
    <>
      <table className={`${styles.table} ${styles.composition}`}>
        <thead>
          <tr>
            <th scope="col">Team role</th>
            <th scope="col">Needed</th>
            <th scope="col">Active</th>
            <th scope="col">Proposed</th>
            <th scope="col">Open</th>
          </tr>
        </thead>
        <tbody>
          {composition.map((row) => (
            <tr key={row.requirement.requirementId}>
              <th scope="row" className={styles.compositionRole}>
                {row.requirement.teamRole.name}
                {/* A word, never a colour. The role was retired after the project
                    asked for it, and the requirement still stands. */}
                {row.requirement.teamRole.active ? null : (
                  <span className={styles.muted}> · retired role</span>
                )}
              </th>
              <td data-label="Needed">{row.needed}</td>
              {/* Solid: these people are on the project. */}
              <td data-label="Active" className={styles.activeCount}>
                {row.active}
              </td>
              {/* Dashed: requests nobody has answered yet. */}
              <td data-label="Proposed" className={styles.proposedCount}>
                {row.proposed ?? "—"}
              </td>
              <td
                data-label="Open"
                className={row.open === 0 ? styles.openNone : styles.openCount}
              >
                {row.open}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className={styles.panelNote}>
        Open counts people still to find. Proposed people are waiting on a department
        manager and are not allocated, so they do not reduce Open.
        {proposedUnavailable
          ? " Pending proposals could not be read, so that column is unknown rather than zero."
          : null}
      </p>
    </>
  );
}
