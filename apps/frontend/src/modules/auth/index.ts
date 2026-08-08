/**
 * The auth module's public boundary.
 *
 * Only browser-safe surface is exported. Everything under `server/` is
 * `server-only` and must be imported by route handlers and server components
 * directly — routing it through here would risk pulling backend transport into a
 * client bundle.
 */
export { ForgotPasswordPage } from "./components/ForgotPasswordPage";
export { LoginPage } from "./components/LoginPage";
export { ResetPasswordPage } from "./components/ResetPasswordPage";
export { SignOutButton } from "./components/SignOutButton";

export { confirmPasswordReset, fetchSession, requestPasswordReset, signIn, signOut } from "./api/authClient";

export type { ProductAuthError, ProductAuthErrorCode } from "./model/errors";
export type { LoginCredentials, ProductSession, ProductUser } from "./model/session";
