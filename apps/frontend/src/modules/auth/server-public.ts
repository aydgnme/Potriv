import "server-only";

/**
 * The auth module's **server-only** public boundary for other product modules.
 *
 * The architecture rule is `app → modules → shared`, and modules should not
 * reach into each other. This is the one deliberate exception: every product
 * module needs authenticated backend calls, and the alternative — each of them
 * reading cookies, building an Authorization header and knowing the backend URL
 * — would spread credential handling across the whole codebase.
 *
 * So auth owns credential mechanics and exposes exactly this. Nothing else in
 * `modules/auth/server/**` may be imported from another module.
 *
 * `server-only` makes an accidental client import a build error rather than a
 * leak.
 */
export { backendGet, BackendRequestError } from "./server/backendTransport";
export type { BackendRequestOutcome } from "./server/backendTransport";
