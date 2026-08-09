import { Button } from "@/shared/ui/Button";

import type { EffectiveCriteria } from "../model/teamFinderData";
import type { TeamFinderCriteriaInput } from "../model/teamFinderQuery";
import { CLOSE_TO_FINISH_WEEKS_RANGE, LIMIT_RANGE } from "../model/teamFinderQuery";

import styles from "./TeamFinder.module.css";

export type TeamFinderCriteriaFormProps = {
  readonly criteria: TeamFinderCriteriaInput;
  /** What the backend actually used, including the defaults it filled in. */
  readonly effective: EffectiveCriteria | null;
};

const WEEK_OPTIONS = Array.from(
  { length: CLOSE_TO_FINISH_WEEKS_RANGE.max - CLOSE_TO_FINISH_WEEKS_RANGE.min + 1 },
  (_, index) => CLOSE_TO_FINISH_WEEKS_RANGE.min + index,
);

/**
 * The criteria, as a plain form that navigates.
 *
 * A `method="get"` form puts the criteria in the address and reloads the page,
 * which is exactly what is wanted: one explicit run, one backend call, a
 * shareable URL, and a screen that works before any JavaScript has loaded.
 *
 * Nothing here fires on a keystroke or a toggle. Team Finder ranks the whole
 * organization against a project; running it because someone ticked a box on
 * their way to ticking three more would be work nobody asked for.
 */
export function TeamFinderCriteriaForm({ criteria, effective }: TeamFinderCriteriaFormProps) {
  return (
    <form method="get" className={styles.criteria}>
      <fieldset className={styles.criteriaFields}>
        <legend className={styles.legend}>Who to include</legend>

        <label className={styles.checkbox}>
          <input
            type="checkbox"
            name="includePartiallyAvailable"
            value="true"
            defaultChecked={criteria.includePartiallyAvailable}
          />
          Partially available
        </label>

        <label className={styles.checkbox}>
          <input
            type="checkbox"
            name="includeUnavailable"
            value="true"
            defaultChecked={criteria.includeUnavailable}
          />
          Unavailable
        </label>

        <label className={styles.checkbox}>
          <input
            type="checkbox"
            name="includeCloseToFinish"
            value="true"
            defaultChecked={criteria.includeCloseToFinish}
          />
          Close to finishing other work
        </label>

        <label className={styles.inlineField}>
          <span className={styles.inlineLabel}>Within</span>
          <select
            name="closeToFinishWeeks"
            defaultValue={criteria.closeToFinishWeeks ?? ""}
            className={styles.control}
          >
            <option value="">Default</option>
            {WEEK_OPTIONS.map((weeks) => (
              <option key={weeks} value={weeks}>
                {weeks} weeks
              </option>
            ))}
          </select>
        </label>

        <label className={styles.inlineField}>
          <span className={styles.inlineLabel}>Return at most</span>
          <input
            type="number"
            name="limit"
            min={LIMIT_RANGE.min}
            max={LIMIT_RANGE.max}
            step={1}
            defaultValue={criteria.limit ?? ""}
            placeholder="50"
            className={[styles.control, styles.limitInput].join(" ")}
          />
          <span className={styles.inlineLabel}>candidates</span>
        </label>

        <Button type="submit" variant="primary" size="sm">
          Run finder
        </Button>
      </fieldset>

      {effective ? (
        // The backend's echo, not the form draft: it is the only thing that
        // knows which defaults were applied.
        <p className={styles.panelNote}>{`Showing results for ${describe(effective)}.`}</p>
      ) : null}
    </form>
  );
}

function describe(criteria: EffectiveCriteria): string {
  const included = ["fully available"];
  if (criteria.includePartiallyAvailable) included.push("partially available");
  if (criteria.includeUnavailable) included.push("unavailable");

  const closeToFinish = criteria.includeCloseToFinish
    ? `, including people finishing other work within ${criteria.closeToFinishWeeks ?? 2} weeks`
    : "";

  return `${included.join(", ")} people${closeToFinish}, at most ${criteria.limit} candidates`;
}
