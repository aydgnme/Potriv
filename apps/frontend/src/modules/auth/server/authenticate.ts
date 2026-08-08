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
 * caller is refused identically either way.
 */

/**
 * Why a sign-in failed, for this module's own use.
 *
 * **Never serialized.** The cleanup depends on knowing the difference, but the
 * browser must not: a response that distinguishes "wrong password" from
 * "correct password, ineligible account" is a way to confirm which credentials
 * are valid. The distinction lives here and stops here.
 */
export type InternalFailureReason =
  | "BACKEND_REJECTED"
  | "PRODUCT_INELIGIBLE"
  | "UPSTREAM";

export type AuthenticationOutcome =
  | { readonly ok: true; readonly user: ProductUser; readonly tokens: BackendTokenPair }
  | {
      readonly ok: false;
      /** The only part a route may forward. */
      readonly error: ProductAuthError;
      readonly internalReason: InternalFailureReason;
    };

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

  if (!result.ok) {
    const upstream = result.error.code === "NETWORK" || result.error.code === "SERVER";
    return {
      ok: false,
      error: result.error,
      internalReason: upstream ? "UPSTREAM" : "BACKEND_REJECTED",
    };
  }

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
  // to be refused anyway.
  try {
    await dependencies.logout(result.value.accessToken);
  } catch {
    // Nothing to report: no credential reached the browser either way, and the
    // thrown value could carry the token.
  }

  // **Byte-identical to a wrong password**, deliberately. Same code, same
  // message, and the route maps both to the same status — otherwise the
  // response would confirm that these credentials are valid, which is precisely
  // what the backend's uniform login error exists to prevent.
  return {
    ok: false,
    error: productAuthError("INVALID_CREDENTIALS", INVALID_CREDENTIALS_MESSAGE),
    internalReason: "PRODUCT_INELIGIBLE",
  };
}
