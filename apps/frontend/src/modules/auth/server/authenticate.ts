import "server-only";

import {
  INVALID_CREDENTIALS_MESSAGE,
  productAuthError,
  type ProductAuthError,
} from "../model/errors";
import type { ProductUser } from "../model/session";
import { login as loginOnBackend, logout as logoutOnBackend, type BackendTokenPair } from "./backendAuth";
import { toProductUser } from "./productSession";

/**
 * Signing in, as a domain operation rather than an HTTP handler.
 *
 * Kept out of the route so the rejected-session cleanup can be tested directly:
 * that path is easy to get wrong and invisible from the outside, because a
 * caller sees the same refusal either way.
 */

export type AuthenticationOutcome =
  | { readonly ok: true; readonly user: ProductUser; readonly tokens: BackendTokenPair }
  | { readonly ok: false; readonly error: ProductAuthError };

type Dependencies = {
  readonly login: typeof loginOnBackend;
  readonly logout: typeof logoutOnBackend;
};

const DEFAULTS: Dependencies = { login: loginOnBackend, logout: logoutOnBackend };

export async function authenticateForProduct(
  email: string,
  password: string,
  userAgent: string | null,
  dependencies: Dependencies = DEFAULTS,
): Promise<AuthenticationOutcome> {
  const result = await dependencies.login(email, password, userAgent);
  if (!result.ok) return { ok: false, error: result.error };

  const user = toProductUser(result.value, result.value.name);
  if (user) return { ok: true, user, tokens: result.value };

  // The credentials were correct, so the backend has already created a session
  // and issued tokens — but this is not a session the product can represent:
  // SYSTEM_ADMIN with no ordinary role, or no organization. Nothing reaches the
  // browser, yet the server-side session would otherwise stay alive with no way
  // for anyone to see or revoke it. So it is closed here.
  //
  // Best effort by design. The refusal below is what protects the browser, so a
  // cleanup that fails must not turn into an error for a request that was going
  // to be refused anyway — guarded here rather than trusting the transport to
  // swallow everything forever.
  try {
    await dependencies.logout(result.value.accessToken);
  } catch {
    // Nothing to report: no credential reached the browser either way, and the
    // thrown value could carry the token.
  }

  // Refused with the same wording as a bad password. Saying "your account
  // cannot use this product" would confirm the address exists.
  return {
    ok: false,
    error: productAuthError("UNAUTHENTICATED", INVALID_CREDENTIALS_MESSAGE),
  };
}
