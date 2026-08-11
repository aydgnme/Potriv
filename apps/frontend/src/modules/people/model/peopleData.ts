import type { AccessRole } from "@/shared/types/accessRole";

/**
 * The two People contracts, kept apart on purpose.
 *
 * An organization admin asks "who belongs to this organization, and what can
 * they do?"; a department manager asks "who belongs to my department, and who is
 * still unassigned?". Different endpoints, different authority, and — easy to
 * miss — different field names for the same idea:
 *
 * ```
 * GET /users                       roles
 * GET /departments/{id}/members    accessRoles
 * ```
 *
 * One shared shape would silently render an empty chip list for whichever side
 * lost the coin toss, so there are two types and no casual reuse.
 */

/** `GET /users` — organization-admin only. */
export type OrganizationUser = {
  readonly userId: string;
  readonly organizationId: string;
  readonly name: string;
  readonly email: string;
  readonly roles: readonly AccessRole[];
};

/**
 * `GET /users/{userId}` — organization-admin only.
 *
 * Carries timestamps the summary does not, and still nothing about departments,
 * account status, projects, skills or sessions. There is no such data to show.
 */
export type OrganizationUserDetail = OrganizationUser & {
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
};

/**
 * `GET /departments/{id}/members` and `GET /departments/unassigned-employees`.
 *
 * Note `accessRoles`, not `roles`.
 */
export type DepartmentUser = {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly accessRoles: readonly AccessRole[];
};

/**
 * The department this manager actually manages, as the backend reports it.
 *
 * `GET /department/projects` is the only endpoint that tells a department
 * manager their own department id — the membership endpoints need it and will
 * not infer it, and the ordinary product has no admin department list to ask.
 */
export type ManagedDepartment = {
  readonly departmentId: string;
  readonly name: string;
};

/** The roles either shape carries, read through the right field. */
export function rolesOf(person: OrganizationUser | DepartmentUser): readonly AccessRole[] {
  return "roles" in person ? person.roles : person.accessRoles;
}
