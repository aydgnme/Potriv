import { Alert } from "@/shared/ui/Alert";

import type { CapacityContext } from "../model/reviewQueue";

import styles from "./Staffing.module.css";

export type CapacityBlockProps = {
  readonly capacity: CapacityContext;
};

/**
 * The employee's day, as the backend computed it.
 *
 * Every number comes from the response and the denominator is `maxHoursPerDay` —
 * published precisely so no client has to hard-code a working day. Nothing here
 * is derived: `currentlyAcceptableByCapacity` is the backend's own conclusion,
 * reached with the same rule acceptance uses, and second-guessing it from the
 * figures would be a quieter capacity model that could disagree.
 *
 * It is current state, not a reservation. Nothing is held back for this proposal,
 * so a context that says a request fits is not a promise that accepting it in a
 * minute will succeed — which is why the note is there.
 */
export function CapacityBlock({ capacity }: CapacityBlockProps) {
  return (
    <section className={styles.panel} aria-labelledby="review-capacity">
      <h3 className={styles.panelHeading} id="review-capacity">
        Capacity
      </h3>

      <dl className={styles.figures}>
        <div className={styles.figureRow}>
          <dt>Allocated now</dt>
          <dd>{`${capacity.allocatedHoursPerDay} / ${capacity.maxHoursPerDay} h`}</dd>
        </div>
        <div className={styles.figureRow}>
          <dt>Available now</dt>
          <dd>{`${capacity.availableHoursPerDay} h`}</dd>
        </div>
        <div className={styles.figureRow}>
          <dt>Requested</dt>
          <dd>{`${capacity.requestedHoursPerDay} h`}</dd>
        </div>
        <div className={styles.figureRow}>
          <dt>After accepting</dt>
          <dd>
            {`${capacity.projectedAllocatedHoursPerDay} / ${capacity.maxHoursPerDay} h`}
          </dd>
        </div>
        <div className={styles.figureRow}>
          <dt>Remaining</dt>
          <dd>{`${capacity.projectedAvailableHoursPerDay} h`}</dd>
        </div>
      </dl>

      {capacity.currentlyAcceptableByCapacity ? null : (
        // A real state, not an error: the backend deliberately leaves such a
        // proposal pending rather than rejecting it on the manager's behalf.
        <Alert tone="warning" title="This no longer fits">
          This request no longer fits the employee&apos;s current capacity. You can reject it,
          or leave it pending and review it later.
        </Alert>
      )}

      <p className={styles.panelNote}>
        Capacity is current as of this review and is checked again when you accept.
      </p>
    </section>
  );
}
