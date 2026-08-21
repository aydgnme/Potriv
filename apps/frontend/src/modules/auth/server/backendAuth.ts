import "server-only";

import {
  GENERIC_SERVER_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  NETWORK_MESSAGE,
  RESET_TOKEN_INVALID_MESSAGE,
  productAuthError,
  type ProductAuthError,
} from "../model/errors";
import { backendBaseUrl } from "./authConfig";
import { safeBackendMessage } from "./backendTransport";

/**
 * The only place that talks to the Spring backend's auth endpoints.
 *
 * Nothing here logs a credential, a token or an Authorization header, and no
 * thrown value carries one — a stack trace that leaks a refresh token is a
 * breach, not a debugging aid.
 */

/** Exactly the fields `TokenPairResponse` provides. */
export type BackendTokenPair = {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly tokenType: string;
  readonly expiresInSeconds: number;
  readonly userId: string;
  readonly organizationId: string | null;
  readonly name: string;
  readonly email: string;
  readonly roles: readonly string[];
};

/** Exactly the fields `CurrentUserResponse` provides — note: no name. */
export type BackendCurrentUser = {
  readonly userId: string;
  readonly organizationId: string | null;
  readonly email: string;
  readonly roles: readonly string[];
};

export type BackendResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ProductAuthError };

type RequestOptions = {
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly body?: unknown;
  readonly accessToken?: string;
  /** Forwarded so the backend records the real browser, not the BFF. */
  readonly userAgent?: string | null;
};

async function callBackend(options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;
  if (options.userAgent) headers["User-Agent"] = options.userAgent;

  return fetch(`${backendBaseUrl()}${options.path}`, {
    method: options.method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    // Authentication state must never be served from a cache, least of all one
    // shared between users.
    cache: "no-store",
  });
}

/** Reads the backend's error body without letting any of it reach the browser. */
async function backendMessage(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "message" in body) {
      const message = (body as { message?: unknown }).message;
      return typeof message === "string" ? message : null;
    }
  } catch {
    // A non-JSON error body is not worth reporting; the status is enough.
  }
  return null;
}

export async function login(
  email: string,
  password: string,
  userAgent: string | null,
): Promise<BackendResult<BackendTokenPair>> {
  let response: Response;
  try {
    response = await callBackend({
      method: "POST",
      path: "/auth/login",
      body: { email, password },
      userAgent,
    });
  } catch {
    // Deliberately catching without inspecting: the thrown value can contain the
    // request, and the request contains the password.
    return { ok: false, error: productAuthError("NETWORK", NETWORK_MESSAGE) };
  }

  if (response.ok) {
    return { ok: true, value: (await response.json()) as BackendTokenPair };
  }

  // The backend answers 400 for bad credentials — and identically for unknown
  // email, inactive and locked accounts, which is the point.
  if (response.status === 400 || response.status === 401) {
    return {
      ok: false,
      error: productAuthError("INVALID_CREDENTIALS", INVALID_CREDENTIALS_MESSAGE),
    };
  }
  return { ok: false, error: productAuthError("SERVER", GENERIC_SERVER_MESSAGE) };
}

export async function refresh(
  refreshToken: string,
): Promise<BackendResult<BackendTokenPair>> {
  let response: Response;
  try {
    response = await callBackend({
      method: "POST",
      path: "/auth/refresh",
      body: { refreshToken },
    });
  } catch {
    return { ok: false, error: productAuthError("NETWORK", NETWORK_MESSAGE) };
  }

  if (response.ok) {
    return { ok: true, value: (await response.json()) as BackendTokenPair };
  }

  // 401 means the token was already used or the session was revoked. There is
  // nothing to retry: presenting it again is what trips reuse detection.
  if (response.status === 401) {
    return {
      ok: false,
      error: productAuthError("UNAUTHENTICATED", "Your session has expired."),
    };
  }
  return { ok: false, error: productAuthError("SERVER", GENERIC_SERVER_MESSAGE) };
}

export async function currentUser(
  accessToken: string,
): Promise<BackendResult<BackendCurrentUser>> {
  let response: Response;
  try {
    response = await callBackend({ method: "GET", path: "/auth/me", accessToken });
  } catch {
    return { ok: false, error: productAuthError("NETWORK", NETWORK_MESSAGE) };
  }

  if (response.ok) {
    return { ok: true, value: (await response.json()) as BackendCurrentUser };
  }
  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      error: productAuthError("UNAUTHENTICATED", "Your session has expired."),
    };
  }
  return { ok: false, error: productAuthError("SERVER", GENERIC_SERVER_MESSAGE) };
}

/**
 * Revokes the current backend session. Best effort by design: whether or not
 * this succeeds, the caller clears the local cookies, because leaving the
 * browser apparently signed in would be the worse failure.
 */
export async function logout(accessToken: string): Promise<void> {
  try {
    await callBackend({ method: "POST", path: "/auth/logout", accessToken });
  } catch {
    // Intentionally ignored — see above.
  }
}

/**
 * Revokes every session this user has, including the current one.
 *
 * Unlike `logout`, the outcome is **reported** rather than swallowed. "Sign out
 * everywhere" makes a promise about other devices that this browser cannot keep
 * on its own, so a caller has to be able to tell the difference between "all
 * sessions are gone" and "you are signed out here, and we could not reach the
 * rest". Claiming the first when only the second happened would leave somebody
 * believing a stolen session was closed.
 */
export async function logoutAll(accessToken: string): Promise<boolean> {
  try {
    const response = await callBackend({
      method: "POST",
      path: "/auth/logout-all",
      accessToken,
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Exactly what `RegisterAdminResponse` provides.
 *
 * Note what is absent: no access token, no refresh token. The backend does not
 * sign the new administrator in, so neither does this — the caller cannot invent
 * a session the contract did not grant.
 */
export type BackendWorkspaceRegistration = {
  readonly userId: string;
  readonly organizationId: string;
  /**
   * The backend builds this from its own `app.frontend-url`, which currently
   * points at an origin this app does not serve. It is therefore accepted and
   * discarded rather than shown — see the V2-02 note in the migration doc.
   */
  readonly employeeInviteUrl?: string;
};

/**
 * Creates an organization and its first administrator.
 *
 * `POST /auth/register-admin` is `permitAll` on the backend and takes no
 * credentials, so this touches no cookie and rotates nothing. It is a plain
 * create, and the session boundary is deliberately untouched by it.
 */
export async function registerWorkspace(
  input: {
    readonly name: string;
    readonly email: string;
    readonly password: string;
    readonly organizationName: string;
    readonly headquarterAddress: string;
  },
  userAgent: string | null,
): Promise<BackendResult<BackendWorkspaceRegistration>> {
  let response: Response;
  try {
    response = await callBackend({
      method: "POST",
      path: "/auth/register-admin",
      body: input,
      userAgent,
    });
  } catch {
    return { ok: false, error: productAuthError("NETWORK", NETWORK_MESSAGE) };
  }

  if (response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const userId = readId(body, "userId");
    const organizationId = readId(body, "organizationId");
    if (!userId || !organizationId) {
      // A 201 we cannot read is not a success we can report.
      return { ok: false, error: productAuthError("SERVER", GENERIC_SERVER_MESSAGE) };
    }
    return { ok: true, value: { userId, organizationId } };
  }

  if (response.status === 400 || response.status === 409) {
    // The backend's own sentence — "Email address is already used." is the
    // common one — but only when it passes the same leak check every other
    // forwarded message goes through. Registration necessarily reveals that an
    // address is taken; that is the endpoint's existing, unavoidable behaviour
    // for self-service signup, not something added here.
    const body: unknown = await response.json().catch(() => null);
    const detail = safeBackendMessage(body);
    return {
      ok: false,
      error: productAuthError(
        "VALIDATION",
        detail ?? "Check the details and try again.",
      ),
    };
  }

  return { ok: false, error: productAuthError("SERVER", GENERIC_SERVER_MESSAGE) };
}

function readId(body: unknown, key: string): string | null {
  if (!body || typeof body !== "object") return null;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Why an invite failure is reported as one thing.
 *
 * The backend distinguishes a token it has never seen (404) from one that is
 * inactive or expired (400). Both mean the same thing to the person holding the
 * link — it does not work — and telling them which would confirm whether a given
 * token ever existed. They collapse to `INVITE_INVALID`.
 *
 * A duplicate email is different: it is about the caller's own input, it is
 * checked before the token is even looked at, and the person needs to know to
 * sign in instead. It stays a validation error.
 */
export type InviteFailure = "INVITE_INVALID" | "VALIDATION" | "NETWORK" | "SERVER";

export type BackendInviteRegistration = {
  readonly userId: string;
  readonly organizationId: string;
};

/**
 * Registers an employee against an invite token.
 *
 * `POST /auth/register-employee/{token}` is `permitAll`, takes no credentials
 * and returns no token pair — so this sets no cookie and creates no session.
 * The token is path-encoded here and never returned to the caller.
 */
export async function registerWithInvite(
  inviteToken: string,
  input: { readonly name: string; readonly email: string; readonly password: string },
  userAgent: string | null,
): Promise<
  | { readonly ok: true; readonly value: BackendInviteRegistration }
  | { readonly ok: false; readonly failure: InviteFailure; readonly message: string }
> {
  let response: Response;
  try {
    response = await callBackend({
      method: "POST",
      // Encoded so a token containing URL-significant characters cannot alter
      // the path it is addressed to.
      path: `/auth/register-employee/${encodeURIComponent(inviteToken)}`,
      body: input,
      userAgent,
    });
  } catch {
    return { ok: false, failure: "NETWORK", message: NETWORK_MESSAGE };
  }

  if (response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const userId = readId(body, "userId");
    const organizationId = readId(body, "organizationId");
    if (!userId || !organizationId) {
      return { ok: false, failure: "SERVER", message: GENERIC_SERVER_MESSAGE };
    }
    return { ok: true, value: { userId, organizationId } };
  }

  // An unknown token. Never distinguished from an expired one.
  if (response.status === 404) {
    return { ok: false, failure: "INVITE_INVALID", message: INVITE_INVALID_MESSAGE };
  }

  if (response.status === 400) {
    const body: unknown = await response.json().catch(() => null);
    const detail = safeBackendMessage(body);
    // The backend uses 400 both for a dead token and for a taken email. Only the
    // email case may be reported specifically; anything token-shaped collapses.
    if (detail && /invite/i.test(detail)) {
      return { ok: false, failure: "INVITE_INVALID", message: INVITE_INVALID_MESSAGE };
    }
    return {
      ok: false,
      failure: "VALIDATION",
      message: detail ?? "Check the details and try again.",
    };
  }

  return { ok: false, failure: "SERVER", message: GENERIC_SERVER_MESSAGE };
}

/** One sentence for every dead invite, whatever killed it. */
export const INVITE_INVALID_MESSAGE = "This invite is no longer valid.";

export async function requestPasswordReset(email: string): Promise<BackendResult<null>> {
  let response: Response;
  try {
    response = await callBackend({
      method: "POST",
      path: "/auth/password-reset/request",
      body: { email },
    });
  } catch {
    return { ok: false, error: productAuthError("NETWORK", NETWORK_MESSAGE) };
  }

  // 202 whether or not the address exists. The UI must not distinguish either.
  if (response.ok) return { ok: true, value: null };
  if (response.status === 400) {
    return { ok: false, error: productAuthError("VALIDATION", "Enter a valid email address.") };
  }
  return { ok: false, error: productAuthError("SERVER", GENERIC_SERVER_MESSAGE) };
}

export async function confirmPasswordReset(
  token: string,
  newPassword: string,
): Promise<BackendResult<null>> {
  let response: Response;
  try {
    response = await callBackend({
      method: "POST",
      path: "/auth/password-reset/confirm",
      body: { token, newPassword },
    });
  } catch {
    return { ok: false, error: productAuthError("NETWORK", NETWORK_MESSAGE) };
  }

  if (response.ok) return { ok: true, value: null };

  if (response.status === 400) {
    // 400 covers both a rejected token and a password outside 8–72. The backend
    // does not distinguish invalid from expired from used, and neither does the
    // UI; a password-length failure is told apart by its own message.
    const message = await backendMessage(response);
    if (message && message.toLowerCase().includes("password reset token")) {
      return {
        ok: false,
        error: productAuthError("RESET_TOKEN_INVALID", RESET_TOKEN_INVALID_MESSAGE),
      };
    }
    return {
      ok: false,
      error: productAuthError("VALIDATION", "Password must be 8–72 characters."),
    };
  }
  return { ok: false, error: productAuthError("SERVER", GENERIC_SERVER_MESSAGE) };
}
