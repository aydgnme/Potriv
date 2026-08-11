import "server-only";

import { backendGet, backendPatch, backendPost, backendDelete } from "@/modules/auth/server-public";
import type { AccessRole } from "@/shared/types/accessRole";

import type {
  DepartmentUser,
  ManagedDepartment,
  OrganizationUser,
  OrganizationUserDetail,
} from "../model/peopleData";

/**
 * Every backend call People makes, one typed function each.
 *
 * The paths are literals here; the browser supplies identifiers and never a
 * path. Two authorities are kept apart deliberately — the organization endpoints
 * are admin-only, and the department ones answer for the department this manager
 * actually manages.
 */

export type LoadFailure = "FORBIDDEN" | "NOT_FOUND" | "ERROR";

export type Loaded<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: LoadFailure };

function failureFor(status: number): LoadFailure {
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  return "ERROR";
}

async function load<T>(path: string): Promise<Loaded<T>> {
  const outcome = await backendGet<T>(path);
  if (outcome.ok) return { ok: true, value: outcome.value };
  return { ok: false, reason: failureFor(outcome.error.status) };
}

export type MutationOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly status: number; readonly detail: string | null };

/** `GET /users` — every person in the organization. Organization-admin only. */
export function getOrganizationUsers(): Promise<Loaded<readonly OrganizationUser[]>> {
  return load<readonly OrganizationUser[]>("/users");
}

/** `GET /users/{userId}` — organization-admin only; 404 is anti-leak. */
export function getOrganizationUser(userId: string): Promise<Loaded<OrganizationUserDetail>> {
  return load<OrganizationUserDetail>(`/users/${encodeURIComponent(userId)}`);
}

/**
 * `GET /department/projects` — the only endpoint that tells a department manager
 * which department is theirs.
 *
 * Membership endpoints need an exact id and will not infer one, and the ordinary
 * product has no admin department list to ask. A 403 here is the honest signal
 * that this manager has no appointment yet.
 */
export async function getManagedDepartment(): Promise<Loaded<ManagedDepartment>> {
  const outcome = await load<{ readonly department: ManagedDepartment }>("/department/projects");
  if (!outcome.ok) return outcome;
  return { ok: true, value: outcome.value.department };
}

/** `GET /departments/{departmentId}/members` — note `accessRoles`, not `roles`. */
export function getDepartmentMembers(
  departmentId: string,
): Promise<Loaded<readonly DepartmentUser[]>> {
  return load<readonly DepartmentUser[]>(
    `/departments/${encodeURIComponent(departmentId)}/members`,
  );
}

/**
 * `GET /departments/unassigned-employees`.
 *
 * The backend already limits this pool to organization users who hold EMPLOYEE
 * and belong to no department, so it is never rebuilt from `/users`.
 */
export function getUnassignedEmployees(): Promise<Loaded<readonly DepartmentUser[]>> {
  return load<readonly DepartmentUser[]>("/departments/unassigned-employees");
}

/** `PATCH /users/{userId}/roles` — the complete desired product role set. */
export async function updateUserRoles(
  userId: string,
  roles: readonly AccessRole[],
): Promise<MutationOutcome<OrganizationUserDetail>> {
  const outcome = await backendPatch<OrganizationUserDetail>(
    `/users/${encodeURIComponent(userId)}/roles`,
    { roles },
  );
  if (outcome.ok) return { ok: true, value: outcome.value };
  return { ok: false, status: outcome.error.status, detail: outcome.error.detail };
}

/**
 * `POST /departments/{departmentId}/members/{userId}` — answers **200**, not 201.
 *
 * Adding somebody already in this department is an idempotent success; somebody
 * in another department is a 409, and there is no auto-move.
 */
export async function addDepartmentMember(
  departmentId: string,
  userId: string,
): Promise<MutationOutcome<DepartmentUser>> {
  const outcome = await backendPost<DepartmentUser>(
    `/departments/${encodeURIComponent(departmentId)}/members/${encodeURIComponent(userId)}`,
    {},
  );
  if (outcome.ok) return { ok: true, value: outcome.value };
  return { ok: false, status: outcome.error.status, detail: outcome.error.detail };
}

/** `DELETE /departments/{departmentId}/members/{userId}` — 204. Membership only. */
export async function removeDepartmentMember(
  departmentId: string,
  userId: string,
): Promise<MutationOutcome<void>> {
  const outcome = await backendDelete(
    `/departments/${encodeURIComponent(departmentId)}/members/${encodeURIComponent(userId)}`,
  );
  if (outcome.ok) return { ok: true, value: undefined };
  return { ok: false, status: outcome.error.status, detail: outcome.error.detail };
}

/** The full set, so loaders and actions can be tested against fakes. */
export type PeopleDataSources = {
  readonly getOrganizationUsers: typeof getOrganizationUsers;
  readonly getOrganizationUser: typeof getOrganizationUser;
  readonly getManagedDepartment: typeof getManagedDepartment;
  readonly getDepartmentMembers: typeof getDepartmentMembers;
  readonly getUnassignedEmployees: typeof getUnassignedEmployees;
};

export const PEOPLE_DATA_SOURCES: PeopleDataSources = {
  getOrganizationUsers,
  getOrganizationUser,
  getManagedDepartment,
  getDepartmentMembers,
  getUnassignedEmployees,
};
