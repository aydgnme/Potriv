"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { resolveProductSession } from "@/modules/auth/server/productSession";

import { validateDepartmentName } from "../../model/departmentForm";
import { blockerMessage, deletionBlockers } from "../../model/deletability";
import type { DepartmentActionState } from "../../model/organizationActionState";
import {
  createDepartment,
  deleteDepartment,
  getDepartment,
  updateDepartment,
} from "../organizationDataSources";

/**
 * Creating, renaming and deleting departments.
 *
 * Organization administration is organization-admin work, so every action proves
 * that first and reads nothing until it has. The identifier is narrowed to a UUID
 * before it can reach a path, and the department itself is re-read before any
 * destructive decision — the page that rendered the button may be minutes old.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FALLBACK = {
  FORBIDDEN: "You do not have permission to manage departments.",
  // One sentence for both, so trying identifiers reveals nothing.
  NOT_FOUND: "This department does not exist or is not visible to you.",
  CONFLICT: "That change conflicts with the current state. Refresh and try again.",
  VALIDATION: "That department name was not accepted.",
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

async function requireOrganizationAdmin(): Promise<boolean> {
  const session = await resolveProductSession();
  return session.authenticated && session.user.roles.includes("ORGANIZATION_ADMIN");
}

function refreshOrganization(): void {
  revalidatePath("/organization");
  revalidatePath("/organization/departments");
  // Home counts departments and those still missing a manager.
  revalidatePath("/home");
}

export async function createDepartmentAction(
  _previous: DepartmentActionState,
  formData: FormData,
): Promise<DepartmentActionState> {
  if (!(await requireOrganizationAdmin())) return { error: FALLBACK.FORBIDDEN };

  const raw = formData.get("name");
  const name = typeof raw === "string" ? raw : "";

  const validated = validateDepartmentName(name);
  if (!validated.ok) return { fieldErrors: validated.errors, name };

  const created = await createDepartment(validated.name);
  if (!created.ok) {
    // A duplicate is the common case, and the entered value is kept so the form
    // can be corrected rather than retyped.
    return { error: messageFor(created.status, created.detail), name };
  }

  refreshOrganization();

  return { done: `${created.value.name} was created.` };
}

export async function updateDepartmentAction(
  _previous: DepartmentActionState,
  formData: FormData,
): Promise<DepartmentActionState> {
  if (!(await requireOrganizationAdmin())) return { error: FALLBACK.FORBIDDEN };

  const departmentId = formData.get("departmentId");
  if (typeof departmentId !== "string" || !UUID.test(departmentId)) {
    return { error: FALLBACK.NOT_FOUND };
  }

  const raw = formData.get("name");
  const name = typeof raw === "string" ? raw : "";

  const validated = validateDepartmentName(name);
  if (!validated.ok) return { fieldErrors: validated.errors, name };

  // Only the name is editable here, so only the name is sent. Echoing ids or
  // null filler back would invite the backend to act on fields nobody edited.
  const updated = await updateDepartment(departmentId, validated.name);
  if (!updated.ok) {
    return { error: messageFor(updated.status, updated.detail), name };
  }

  refreshOrganization();
  revalidatePath(`/organization/departments/${departmentId}`);

  return { done: `Renamed to ${updated.value.name}.` };
}

/**
 * Deleting a department, with the two blockers this product can see.
 *
 * The re-read is the point: a manager appointed, or a person added, since the
 * page rendered has to stop this. What the browser believed about `memberCount`
 * or `hasManager` is not consulted at all.
 *
 * Passing those two checks is still not a promise. Other modules register their
 * own deletion guards — linked skills among them — that nothing here can see, so
 * a 409 from the backend remains a legitimate answer and is reported as one.
 *
 * Success leaves the route. Staying would render the department's own detail page
 * for a department that no longer exists, and the honest answer that page gives —
 * "does not exist or is not visible to you" — is the right sentence for somebody
 * who typed a stale URL and exactly the wrong one for somebody who just deleted it
 * on purpose. Every failure stays put instead, so the error and the department
 * remain in front of whoever has to act on them.
 */
export async function deleteDepartmentAction(
  _previous: DepartmentActionState,
  formData: FormData,
): Promise<DepartmentActionState> {
  if (!(await requireOrganizationAdmin())) return { error: FALLBACK.FORBIDDEN };

  const departmentId = formData.get("departmentId");
  if (typeof departmentId !== "string" || !UUID.test(departmentId)) {
    return { error: FALLBACK.NOT_FOUND };
  }

  const fresh = await getDepartment(departmentId);
  if (!fresh.ok) {
    return { error: fresh.reason === "ERROR" ? FALLBACK.SERVER : FALLBACK.NOT_FOUND };
  }

  const blockers = deletionBlockers(fresh.value);
  if (blockers.length > 0) {
    // Reported, never resolved: unpicking the department's own dependencies is a
    // far larger operation than the one this button offers.
    return { error: blockers.map(blockerMessage).join(" ") };
  }

  const deleted = await deleteDepartment(departmentId);
  if (!deleted.ok) {
    return { error: messageFor(deleted.status, deleted.detail) };
  }

  refreshOrganization();

  // `redirect` signals by throwing, so nothing after it runs and no success state
  // is returned to a page that is about to be replaced. It must stay outside any
  // `try`, or the framework's own control flow gets caught and reported as an
  // error the user never caused.
  redirect("/organization/departments");
}
