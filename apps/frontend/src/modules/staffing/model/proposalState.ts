/**
 * What a proposal attempt hands back to the form.
 *
 * Deliberately small, and deliberately outside the `"use server"` module: a file
 * with that directive may only export async functions, and — more to the point —
 * everything in this shape crosses to the browser. There is no field here that
 * could carry a token, a backend path or a status code.
 */
export type ProposalState = {
  readonly fieldErrors: Readonly<Record<string, string>>;
  readonly formError?: string;
  /**
   * Set only on success, and named from the backend's own response: the review
   * department is snapshotted server-side, so this is the one authority for what
   * to call it.
   */
  readonly sentTo?: string;
};

export const EMPTY_PROPOSAL_STATE: ProposalState = { fieldErrors: {} };
