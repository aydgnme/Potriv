import type { AccessRole } from "@/shared/types/accessRole";

/**
 * The shape the product needs from a signed-in user. Deliberately minimal — the
 * smallest contract FE-02 can implement against without this task guessing at a
 * session architecture it is not building.
 *
 * Note `displayName` is separate from `email`: `GET /auth/me` returns roles and
 * an email but **no name**, so whoever implements the session has to source the
 * name elsewhere. Naming it here makes that visible rather than a surprise.
 */
export type ProductUser = {
  readonly userId: string;
  readonly organizationId: string;
  readonly email: string;
  readonly displayName: string;
  readonly roles: readonly AccessRole[];
};

/** Credentials as the login form collects them. Never persisted anywhere. */
export type LoginCredentials = {
  readonly email: string;
  readonly password: string;
};
