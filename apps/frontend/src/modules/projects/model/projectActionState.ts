import type { ProjectFormErrors } from "./projectForm";

/**
 * What a project mutation hands back to the form.
 *
 * Deliberately tiny, and deliberately not in the `"use server"` module: a file
 * marked with that directive may only export async functions, and — more to the
 * point — everything in this shape crosses to the browser. There is no field
 * here that could carry a token, a backend path or a status code, so none can be
 * added by accident.
 */
export type ProjectActionState = {
  readonly fieldErrors: ProjectFormErrors;
  readonly formError?: string;
};

export const EMPTY_ACTION_STATE: ProjectActionState = { fieldErrors: {} };
