/**
 * What a review or removal attempt hands back.
 *
 * Deliberately small, and outside the `"use server"` module: a file with that
 * directive may only export async functions, and everything in this shape crosses
 * to the browser. There is no field here that could carry a token, a backend path
 * or a status code.
 */
export type ReviewActionState = {
  readonly error?: string;
  /**
   * True when the proposal was decided by somebody else in the meantime. The
   * queue has been refreshed, so the selected row and its buttons are stale.
   */
  readonly stale?: boolean;
  /** A short confirmation, phrased in terms of what actually happened. */
  readonly done?: string;
};

export const EMPTY_REVIEW_STATE: ReviewActionState = {};

/**
 * What a removal proposal reports back.
 *
 * `sentTo` names the reviewing department from the backend's own response, and
 * success deliberately never says the person was removed — nobody moves until a
 * department manager accepts.
 */
export type RemovalActionState = {
  readonly fieldErrors: Readonly<Record<string, string>>;
  readonly formError?: string;
  readonly sentTo?: string;
};

export const EMPTY_REMOVAL_STATE: RemovalActionState = { fieldErrors: {} };
