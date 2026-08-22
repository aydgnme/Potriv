"use client";

import { useState, type ReactNode } from "react";

/** The shape every Server Action in this app hands back. */
export type ActionOutcome = {
  readonly error?: string;
  readonly done?: string;
};

export type ActionFeedbackProps = {
  /** The outcome to report. `undefined` reports nothing. */
  readonly outcome?: ActionOutcome;
  /** Class for a failure, so each site keeps the look it already had. */
  readonly errorClassName?: string;
  /** Class for a success, likewise. */
  readonly doneClassName?: string;
  /** `span` where only inline content is valid, `p` elsewhere. */
  readonly as?: "p" | "span";
  /**
   * Anything that changes when a *new* result arrives, even one whose text is
   * identical to the last. Pass the action state object: `useActionState` hands
   * back a new one per submission, so identity is the signal. Without it, a
   * second identical failure changes no DOM and is therefore announced to
   * nobody.
   */
  readonly revision?: unknown;
};

/**
 * One action result, said out loud exactly once.
 *
 * **The defect this exists for.** Action results — a revoke that failed, a skill
 * that saved, a category that could not be renamed — were rendered as plain
 * `<span>` and `<p>`. Visible, and programmatically silent. Somebody using a
 * screen reader could complete an action and hear nothing at all about whether
 * it worked. `FormErrorSummary` had already fixed this for *validation*; these
 * are the results of actions that passed validation and then succeeded or
 * failed, which is a different half of the same acceptance item.
 *
 * **Why not `Alert`.** These live inside table rows and compact action rows. An
 * `Alert` is a bordered box with an icon; dropping one into a `<th>` or a
 * skill row would be a visual redesign and would regress the mobile layouts
 * V2-09 just finished measuring. So this keeps each site's existing element and
 * class and adds only what was missing: the role.
 *
 * **Failure is assertive, success is polite.** A failure interrupts because the
 * person is waiting on it and may need to act again; a confirmation can wait for
 * a gap in speech. That is the same split `Alert` already makes.
 *
 * At most one region is rendered. A failure wins over a success, because an
 * outcome carrying both is a contradiction and the failure is the part that
 * needs acting on.
 */
export function ActionFeedback({
  outcome,
  errorClassName,
  doneClassName,
  as = "p",
  revision,
}: ActionFeedbackProps) {
  // Remount on a genuinely new result so an identical message is announced
  // again. A live region reacts to DOM changes, not to the fact that something
  // happened, so re-rendering the same text into the same node says nothing.
  const [seen, setSeen] = useState(revision);
  const [key, setKey] = useState(0);
  if (revision !== seen) {
    setSeen(revision);
    setKey((previous) => previous + 1);
  }

  const Tag = as;
  if (outcome?.error) {
    return (
      <Tag key={`error-${key}`} role="alert" className={errorClassName}>
        {outcome.error}
      </Tag>
    );
  }
  if (outcome?.done) {
    return (
      <Tag key={`done-${key}`} role="status" className={doneClassName}>
        {outcome.done}
      </Tag>
    );
  }
  return null;
}

/**
 * Which of several actions on one row spoke last.
 *
 * A category row owns rename, retire and restore, each with its own
 * `useActionState`. Rendering all three results side by side leaves a stale
 * error sitting next to a later success, and can put two assertive regions on
 * one row at once. Only the most recent result is feedback; the rest are
 * history nobody asked for.
 *
 * Identity is the signal: `useActionState` returns a new object per submission,
 * so the outcome whose reference changed is the one that just happened. The
 * returned `revision` increments on every such change — including a repeat of an
 * identical message — and is what `ActionFeedback` remounts on.
 *
 * **Pass the action states themselves.** Building a wrapper object here — to
 * filter a confirmation, say — creates a fresh reference on every render, which
 * reads as a new result every time and pins the answer to that entry forever.
 * Filter the returned outcome instead; the reference it hands back is one of the
 * ones passed in, so it can be compared against them.
 */
export function useLatestOutcome(outcomes: readonly (ActionOutcome | undefined)[]): {
  readonly outcome: ActionOutcome | undefined;
  readonly revision: number;
} {
  const [previous, setPrevious] = useState(outcomes);
  const [latest, setLatest] = useState<ActionOutcome | undefined>(undefined);
  const [revision, setRevision] = useState(0);

  // Adjusting state during render rather than in an effect: this is derived from
  // props, and an effect would render the stale result first.
  const changed = outcomes.findIndex((outcome, index) => outcome !== previous[index]);
  if (changed !== -1) {
    setPrevious(outcomes);
    setLatest(outcomes[changed]);
    setRevision((current) => current + 1);
  }

  return { outcome: latest, revision };
}

/** Convenience for the common "render whichever of these spoke last" case. */
export function LatestActionFeedback({
  outcomes,
  ...rest
}: Omit<ActionFeedbackProps, "outcome" | "revision"> & {
  readonly outcomes: readonly (ActionOutcome | undefined)[];
}): ReactNode {
  const { outcome, revision } = useLatestOutcome(outcomes);
  return <ActionFeedback outcome={outcome} revision={revision} {...rest} />;
}
