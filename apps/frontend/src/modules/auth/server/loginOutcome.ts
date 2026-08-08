import "server-only";

import type { ProductAuthErrorCode } from "../model/errors";

/**
 * How a product auth failure maps onto an HTTP status.
 *
 * FE-02 answered 401 for everything, which told the browser that a backend
 * outage was a credential problem. The distinction matters: a client should be
 * able to tell "your password is wrong" from "we could not reach the service",
 * and only the first is worth retyping a password for.
 *
 * The status becomes more accurate; the *message* does not. Every credential
 * failure still reads the same, because the backend deliberately refuses to say
 * which addresses exist.
 */
export function loginFailureStatus(code: ProductAuthErrorCode): number {
  switch (code) {
    case "VALIDATION":
      return 400;
    case "INVALID_CREDENTIALS":
      return 401;
    // The credentials were fine — the resulting session is not one this product
    // can represent. Refusal, not authentication failure.
    case "UNAUTHENTICATED":
      return 403;
    // The backend could not be reached or answered unexpectedly. This BFF is a
    // gateway to it, so a gateway status is the honest one.
    case "NETWORK":
    case "SERVER":
    case "RESET_TOKEN_INVALID":
      return 502;
    default:
      return 502;
  }
}
