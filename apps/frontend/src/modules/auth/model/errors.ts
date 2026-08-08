/**
 * What the browser is allowed to learn when something goes wrong.
 *
 * The backend's error body carries `timestamp`, `status`, `error`, `message` and
 * `path`. Forwarding that verbatim would leak internal endpoint paths and hand
 * the UI a message written for an API client. Everything crossing the BFF is
 * narrowed to this shape instead.
 */
export type ProductAuthError = {
  /** Stable enough for the UI to branch on; never a backend class name. */
  readonly code: ProductAuthErrorCode;
  /** Safe to render as-is. */
  readonly message: string;
};

export type ProductAuthErrorCode =
  | "INVALID_CREDENTIALS"
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "RESET_TOKEN_INVALID"
  | "NETWORK"
  | "SERVER";

/**
 * The one message shown for every failed sign-in.
 *
 * The backend deliberately answers unknown email, wrong password, inactive
 * account and locked account identically, so that an attacker cannot use the
 * login form to discover which addresses exist. Splitting these apart in the UI
 * would hand back exactly the signal the backend refuses to give.
 */
export const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password.";

/** Shown for any reset token the backend rejects — it does not say which. */
export const RESET_TOKEN_INVALID_MESSAGE =
  "This password reset link is no longer valid. Request a new one.";

export const GENERIC_SERVER_MESSAGE = "Something went wrong. Please try again.";
export const NETWORK_MESSAGE = "Could not reach Potriv. Check your connection and try again.";

export function productAuthError(
  code: ProductAuthErrorCode,
  message: string,
): ProductAuthError {
  return { code, message };
}
