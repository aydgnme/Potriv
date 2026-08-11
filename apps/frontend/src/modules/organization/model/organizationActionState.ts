import type { DepartmentFormErrors } from "./departmentForm";

/**
 * What a Server Action hands back to the browser.
 *
 * These live outside the `"use server"` files because such a file may only
 * export async functions — a shared constant there is a build error.
 *
 * Every field is product wording. No status code, no backend path, no envelope:
 * whatever the transport learned stays on the server.
 */

export type DepartmentActionState = {
  readonly error?: string;
  readonly done?: string;
  readonly fieldErrors?: DepartmentFormErrors;
  /** Echoed back so a rejected form keeps what was typed. */
  readonly name?: string;
};

export const EMPTY_DEPARTMENT_STATE: DepartmentActionState = {};

export type ManagerActionState = {
  readonly error?: string;
  readonly done?: string;
};

export const EMPTY_MANAGER_STATE: ManagerActionState = {};

export type InviteActionState = {
  readonly error?: string;
  readonly done?: string;
};

export const EMPTY_INVITE_STATE: InviteActionState = {};
