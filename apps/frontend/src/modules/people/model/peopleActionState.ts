/**
 * What a People mutation hands back.
 *
 * Outside the `"use server"` modules, because a file with that directive may
 * only export async functions — and because everything in this shape crosses to
 * the browser. There is no field here that could carry a token, a backend path
 * or a status code.
 */
export type RoleActionState = {
  readonly error?: string;
  /** A short confirmation naming what changed. */
  readonly done?: string;
};

export const EMPTY_ROLE_STATE: RoleActionState = {};

export type MembershipActionState = {
  readonly error?: string;
  readonly done?: string;
};

export const EMPTY_MEMBERSHIP_STATE: MembershipActionState = {};
