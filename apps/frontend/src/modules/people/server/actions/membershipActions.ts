"use server";

import { revalidatePath } from "next/cache";

import { resolveProductSession } from "@/modules/auth/server/productSession";

import type { MembershipActionState } from "../../model/peopleActionState";
import {
  addDepartmentMember,
  getDepartmentMembers,
  getManagedDepartment,
  getUnassignedEmployees,
  removeDepartmentMember,
} from "../peopleDataSources";

/**
 * Department membership, decided by the department this manager actually manages.
 *
 * **The department id is never taken from the browser.** It is re-resolved from
 * `GET /department/projects` on every mutation, so a form cannot name somebody
 * else's department however it is edited. Membership is all that changes: no
 * account is created or deleted, and no access role moves.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FALLBACK = {
  FORBIDDEN: "You are not managing a department yet.",
  NOT_FOUND: "That person is no longer available to change.",
  CONFLICT: "That could not be done as things stand.",
  VALIDATION: "That could not be accepted. Try again.",
  UNAUTHENTICATED: "Your session has expired. Sign in again to continue.",
  SERVER: "Something went wrong. Try again.",
} as const;

function messageFor(status: number, detail: string | null): string {
  if (detail !== null) return detail;
  if (status === 400 || status === 422) return FALLBACK.VALIDATION;
  if (status === 401) return FALLBACK.UNAUTHENTICATED;
  if (status === 403) return FALLBACK.FORBIDDEN;
  if (status === 404) return FALLBACK.NOT_FOUND;
  if (status === 409) return FALLBACK.CONFLICT;
  return FALLBACK.SERVER;
}

/** Resolves the caller's own department, or the reason there is none. */
async function requireManagedDepartment(): Promise<
  { readonly ok: true; readonly departmentId: string } | { readonly ok: false; readonly error: string }
> {
  const session = await resolveProductSession();
  if (!session.authenticated || !session.user.roles.includes("DEPARTMENT_MANAGER")) {
    return { ok: false, error: FALLBACK.FORBIDDEN };
  }

  const department = await getManagedDepartment();
  if (!department.ok) {
    return {
      ok: false,
      error: department.reason === "ERROR" ? FALLBACK.SERVER : FALLBACK.FORBIDDEN,
    };
  }

  return { ok: true, departmentId: department.value.departmentId };
}

function readUserId(formData: FormData): string | null {
  const value = formData.get("userId");
  return typeof value === "string" && UUID.test(value) ? value : null;
}

/** Both lists move, and Home's unassigned summary with them. */
function revalidatePeople(): void {
  revalidatePath("/people");
  revalidatePath("/home");
}

export async function addDepartmentMemberAction(
  _previous: MembershipActionState,
  formData: FormData,
): Promise<MembershipActionState> {
  const department = await requireManagedDepartment();
  if (!department.ok) return { error: department.error };

  const userId = readUserId(formData);
  if (userId === null) return { error: FALLBACK.VALIDATION };

  // Freshness by re-reading the pool the backend itself defines: organization
  // users holding EMPLOYEE with no department. `/users` is not an eligibility
  // source and is never consulted here.
  const pool = await getUnassignedEmployees();
  if (!pool.ok) return { error: FALLBACK.SERVER };

  const stillUnassigned = pool.value.some((person) => person.userId === userId);
  if (!stillUnassigned) {
    // Somebody else took them between render and submit. Nothing is moved.
    revalidatePeople();
    return { error: "That person is no longer unassigned. The lists have been refreshed." };
  }

  const added = await addDepartmentMember(department.departmentId, userId);
  if (!added.ok) {
    // A 409 means they belong to another department, and there is no auto-move.
    revalidatePeople();
    return { error: messageFor(added.status, added.detail) };
  }

  revalidatePeople();
  // Membership only — deliberately says nothing about roles, because none changed.
  return { done: `${added.value.name} was added to your department.` };
}

export async function removeDepartmentMemberAction(
  _previous: MembershipActionState,
  formData: FormData,
): Promise<MembershipActionState> {
  const department = await requireManagedDepartment();
  if (!department.ok) return { error: department.error };

  const userId = readUserId(formData);
  if (userId === null) return { error: FALLBACK.VALIDATION };

  // The target must be in *this* department's current member list. Without the
  // check a stale row could aim a delete at somebody who has since moved.
  const members = await getDepartmentMembers(department.departmentId);
  if (!members.ok) return { error: FALLBACK.SERVER };

  const member = members.value.find((person) => person.userId === userId);
  if (member === undefined) {
    revalidatePeople();
    return { error: "That person is no longer in your department. The list has been refreshed." };
  }

  const removed = await removeDepartmentMember(department.departmentId, userId);
  if (!removed.ok) {
    revalidatePeople();
    return { error: messageFor(removed.status, removed.detail) };
  }

  revalidatePeople();
  return {
    done: `${member.name} was removed from your department. Their account and access roles are unchanged.`,
  };
}
