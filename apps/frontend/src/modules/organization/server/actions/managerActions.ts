"use server";

import { revalidatePath } from "next/cache";

import { resolveProductSession } from "@/modules/auth/server/productSession";

import { checkManagerAssignment, managerChoices } from "../../model/managerChoices";
import type { ManagerActionState } from "../../model/organizationActionState";
import {
  assignDepartmentManager,
  getDepartments,
  getOrganizationMembers,
  removeDepartmentManager,
} from "../organizationDataSources";

/**
 * Appointing and removing a department's manager.
 *
 * An appointment is not a role. Nothing in this file calls `PATCH /users/{id}/roles`
 * — appointing somebody never grants `DEPARTMENT_MANAGER`, and removing them never
 * takes it away. Bundling the two would make an organizational change quietly
 * rewrite somebody's capabilities, and a person who stops managing a department
 * usually still is a department manager.
 *
 * Eligibility is re-derived here from fresh reads of both lists. The picker was
 * rendered from the same rule, but it was rendered in a browser and may predate
 * a role change or another appointment.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FALLBACK = {
  FORBIDDEN: "You do not have permission to appoint department managers.",
  NOT_FOUND: "This department does not exist or is not visible to you.",
  CONFLICT: "That appointment conflicts with the current state. Refresh and try again.",
  VALIDATION: "That appointment was not accepted.",
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

/**
 * Who a manager change affects.
 *
 * The appointment decides who may review staffing requests for the department,
 * so Staffing and People change meaning too — neither is redesigned here, they
 * are simply told to re-read.
 */
function refreshManagerScope(departmentId: string): void {
  revalidatePath("/organization");
  revalidatePath("/organization/departments");
  revalidatePath(`/organization/departments/${departmentId}`);
  revalidatePath("/home");
  revalidatePath("/people");
  revalidatePath("/staffing");
}

export async function assignDepartmentManagerAction(
  _previous: ManagerActionState,
  formData: FormData,
): Promise<ManagerActionState> {
  if (!(await requireOrganizationAdmin())) return { error: FALLBACK.FORBIDDEN };

  const departmentId = formData.get("departmentId");
  if (typeof departmentId !== "string" || !UUID.test(departmentId)) {
    return { error: FALLBACK.NOT_FOUND };
  }

  const userId = formData.get("userId");
  if (typeof userId !== "string" || !UUID.test(userId)) {
    return { error: FALLBACK.VALIDATION };
  }

  const [departments, users] = await Promise.all([getDepartments(), getOrganizationMembers()]);
  if (!departments.ok) {
    return { error: departments.reason === "FORBIDDEN" ? FALLBACK.FORBIDDEN : FALLBACK.SERVER };
  }
  if (!users.ok) {
    return { error: users.reason === "FORBIDDEN" ? FALLBACK.FORBIDDEN : FALLBACK.SERVER };
  }

  // The department must be one this organization can actually see.
  const target = departments.value.find(
    (department) => department.departmentId === departmentId,
  );
  if (!target) return { error: FALLBACK.NOT_FOUND };

  const choices = managerChoices({
    departmentId,
    users: users.value,
    departments: departments.value,
  });

  // Covers all of it from fresh data: unknown person, no Department Manager
  // role, or already managing somewhere else.
  const allowed = checkManagerAssignment(choices, userId);
  if (!allowed.ok) return { error: allowed.reason };

  const saved = await assignDepartmentManager(departmentId, userId);
  if (!saved.ok) {
    // A concurrent appointment can still win the unique constraint; the backend
    // is transactional and stays the authority.
    return { error: messageFor(saved.status, saved.detail) };
  }

  refreshManagerScope(departmentId);

  const manager = saved.value.manager;
  return {
    done: manager
      ? `${manager.name} is now the manager of ${saved.value.name}.`
      : `${saved.value.name} was updated.`,
  };
}

export async function removeDepartmentManagerAction(
  _previous: ManagerActionState,
  formData: FormData,
): Promise<ManagerActionState> {
  if (!(await requireOrganizationAdmin())) return { error: FALLBACK.FORBIDDEN };

  const departmentId = formData.get("departmentId");
  if (typeof departmentId !== "string" || !UUID.test(departmentId)) {
    return { error: FALLBACK.NOT_FOUND };
  }

  const departments = await getDepartments();
  if (!departments.ok) {
    return { error: departments.reason === "FORBIDDEN" ? FALLBACK.FORBIDDEN : FALLBACK.SERVER };
  }

  const target = departments.value.find(
    (department) => department.departmentId === departmentId,
  );
  if (!target) return { error: FALLBACK.NOT_FOUND };

  const removed = await removeDepartmentManager(departmentId);
  if (!removed.ok) {
    return { error: messageFor(removed.status, removed.detail) };
  }

  refreshManagerScope(departmentId);

  // Deliberately says what did not happen: the role survives the appointment.
  return {
    done: `${target.name} has no manager. Their Department Manager access role is unchanged.`,
  };
}
