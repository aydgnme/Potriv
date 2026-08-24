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
/**
 * An invitation, as an administrator is allowed to see it.
 *
 * There is no link and no token here, and that is the point. The backend mails
 * the credential to the person it was issued for and returns only what an
 * administrator needs to manage the invitation: which one it is, roughly who it
 * went to, where it stands, and when it lapses. Nothing on this type can be
 * used to join the organization.
 *
 * `maskedEmail` is masked by the backend (`al****@example.com`). The full
 * address is not returned, so an administrator list cannot be scraped for
 * colleagues' addresses.
 */
export type InviteStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";

/**
 * Whether the link has actually left the building.
 *
 * Separate from the invitation's own status, because they answer different
 * questions. Conflating them is what let the product say "sent" while the mail
 * server was refusing connections: an administrator waiting for somebody to
 * accept had no way to learn the person had never received anything.
 */
export type InviteDelivery = "QUEUED" | "SENT" | "FAILED";

export type OrganizationInvite = {
  readonly inviteId: string;
  readonly maskedEmail: string;
  readonly status: InviteStatus;
  readonly delivery: InviteDelivery;
  readonly createdAt: string;
  readonly expiresAt: string;
};
