import type { AccessRole } from "@/shared/types/accessRole";

/**
 * What the organization endpoints actually return.
 *
 * These mirror `DepartmentResponse`, `DepartmentManagerSummary` and
 * `EmployeeInviteResponse` field for field. Nothing here is widened with a
 * project count, a capacity figure or a department status: the backend has none
 * of them, so a field would be blank or invented.
 */

/** A department's manager, or `null` when nobody is appointed. */
export type DepartmentManager = {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
};

export type Department = {
  readonly departmentId: string;
  readonly name: string;
  readonly manager: DepartmentManager | null;
  readonly memberCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

/**
 * A person from `GET /users`, narrowed to what manager appointment needs.
 *
 * Note `roles` — the organization user contract, not the department one, which
 * calls the same thing `accessRoles`.
 */
export type OrganizationMember = {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly roles: readonly AccessRole[];
};

/**
 * The current employee invite.
 *
 * `expiresAt` is part of the contract but the backend creates employee invites
 * with `null`, so the product treats them as non-expiring and shows no countdown.
 * It is kept on the type so a future non-null value is visible rather than lost.
 */
export type OrganizationInvite = {
  readonly inviteId: string;
  readonly inviteUrl: string;
  readonly active: boolean;
  readonly createdAt: string;
  readonly expiresAt: string | null;
};
