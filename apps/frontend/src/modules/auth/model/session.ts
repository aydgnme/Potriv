import type { AccessRole } from "@/shared/types/accessRole";

/**
 * The signed-in user, as the product understands them.
 *
 * `displayName` comes from the login/refresh response, which carries `name`.
 * `GET /auth/me` does **not** — it returns `userId`, `organizationId`, `email`
 * and `roles` only — so the name is kept in a server-managed cookie to survive
 * a reload. It is presentation data and nothing else: identity and roles are
 * always re-read from `/auth/me`, never from that cookie.
 *
 * There is deliberately no `organizationName`. The universal session contract
 * gives an id and no name, and the only endpoint that could supply one is
 * organization-admin-only. That is a backend gap, not licence to invent a label.
 */
export type ProductUser = {
  readonly userId: string;
  readonly organizationId: string;
  readonly email: string;
  readonly displayName: string;
  /** Ordinary product roles only. `SYSTEM_ADMIN` is dropped at the boundary. */
  readonly roles: readonly AccessRole[];
};

/**
 * What the browser is told about its own session. Never contains a token, and
 * has no field that could hold one.
 */
export type ProductSession =
  | { readonly authenticated: true; readonly user: ProductUser }
  | { readonly authenticated: false };

export const UNAUTHENTICATED: ProductSession = { authenticated: false };

/** Credentials as the login form collects them. Never persisted anywhere. */
export type LoginCredentials = {
  readonly email: string;
  readonly password: string;
};
