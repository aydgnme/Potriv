import "server-only";

import type { ProductAuthErrorCode } from "../model/errors";

/**
 * How a login failure maps onto an HTTP status.
 *
 * Two rules pull against each other here, and both matter:
 *
 * 1. A client should be able to tell "your password is wrong" from "we could
 *    not reach the service" — only the first is worth retyping a password for.
 *    So an upstream failure is a gateway status, not `401`.
 *
 * 2. A client must **not** be able to tell "your password is wrong" from "your
 *    password is right but this account cannot use the product". A different
 *    status for the second is a credential oracle: it confirms which
 *    email/password pairs are valid, which is exactly what the backend's
 *    uniform login error is designed to withhold.
 *
 * So `UNAUTHENTICATED` maps to `401` **at the login boundary** and is
 * indistinguishable from a wrong password. That is specific to login: for an
 * already-authenticated product operation, `403` remains the right answer,
 * because by then the caller's identity is not a secret from them.
 */
export function loginFailureStatus(code: ProductAuthErrorCode): number {
  switch (code) {
    case "VALIDATION":
      return 400;
    case "INVALID_CREDENTIALS":
    // Same status as a wrong password, on purpose — see above.
    case "UNAUTHENTICATED":
      return 401;
    case "NETWORK":
    case "SERVER":
    case "RESET_TOKEN_INVALID":
      return 502;
    default:
      return 502;
  }
}
