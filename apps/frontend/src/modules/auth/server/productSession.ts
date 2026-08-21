import "server-only";

import { cache } from "react";

import { cookies } from "next/headers";

import { toProductRoles } from "@/shared/types/accessRole";

import type { ProductSession, ProductUser } from "../model/session";
import { UNAUTHENTICATED } from "../model/session";
import { COOKIE_NAMES } from "./authConfig";
import { currentUser, type BackendCurrentUser, type BackendTokenPair } from "./backendAuth";

/**
 * Resolves who is signed in, on the server, from the access cookie.
 *
 * `GET /auth/me` is the authority for identity and roles — never the cookies.
 * The profile-name cookie supplies a display name and nothing else, because
 * `/auth/me` does not return one.
 */

/**
 * Builds a product user, or rejects the session.
 *
 * Rejection is not an edge case. The server can legitimately return
 * `SYSTEM_ADMIN`, which the product does not model: `toProductRoles` drops it,
 * and a user left with **no** ordinary role has no business inside the product
 * shell. That is an authentication decision, deliberately made here rather than
 * inferred from `getNavigationItems([])` — an empty menu is a presentation
 * detail, not a security boundary.
 */
export function toProductUser(
  backendUser: BackendCurrentUser | BackendTokenPair,
  displayNameFallback: string | null,
): ProductUser | null {
  const roles = toProductRoles(backendUser.roles);
  if (roles.length === 0) return null;

  // Every product capability is scoped to an organization; a session without one
  // cannot be represented honestly, so it is refused rather than patched.
  if (!backendUser.organizationId) return null;

  const name =
    "name" in backendUser && backendUser.name ? backendUser.name : displayNameFallback;

  return {
    userId: backendUser.userId,
    organizationId: backendUser.organizationId,
    email: backendUser.email,
    // Falling back to the email keeps the shell honest when the name cookie has
    // expired — better than an empty greeting or an invented placeholder.
    displayName: name ?? backendUser.email,
    roles,
  };
}

/**
 * The current session according to the backend.
 *
 * Returns unauthenticated rather than throwing when there is no access cookie or
 * `/auth/me` refuses it. Recovering an expired access token is the caller's job
 * — this function deliberately does not refresh, so that nothing can trigger a
 * rotation as a side effect of merely asking who is signed in.
 */
/**
 * Memoized for the lifetime of **one server request**, and nothing longer.
 *
 * A protected layout resolves the session to render the shell, and the page
 * inside it resolves the same session again — two `/auth/me` calls to answer one
 * question about one request. Measured before this was added: a single
 * `/account` render made two.
 *
 * `cache()` is React's per-request memo, not the Data Cache. It is created and
 * discarded with the request, so two users can never share an entry, nothing is
 * written to disk, and no token is retained anywhere. The underlying fetch keeps
 * its `cache: "no-store"` semantics untouched — this deduplicates *within* one
 * render, it does not make authentication cacheable.
 *
 * Safe because this function is a pure read: it deliberately does not refresh
 * (see below), so there is no mutation to accidentally repeat or skip. Cookies
 * cannot change midway through a render, which makes one answer per request the
 * correct answer rather than merely a cheaper one.
 */
export const resolveProductSession = cache(async function resolveProductSession(): Promise<ProductSession> {
  const jar = await cookies();
  const accessToken = jar.get(COOKIE_NAMES.access)?.value;
  if (!accessToken) return UNAUTHENTICATED;

  const result = await currentUser(accessToken);
  if (!result.ok) return UNAUTHENTICATED;

  const user = toProductUser(result.value, jar.get(COOKIE_NAMES.profileName)?.value ?? null);
  return user ? { authenticated: true, user } : UNAUTHENTICATED;
});

/** Whether a refresh cookie exists — used to decide if recovery is worth trying. */
export async function hasRefreshCookie(): Promise<boolean> {
  const jar = await cookies();
  return Boolean(jar.get(COOKIE_NAMES.refresh)?.value);
}
