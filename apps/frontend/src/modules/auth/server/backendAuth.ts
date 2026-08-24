import "server-only";

import {
  GENERIC_SERVER_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  NETWORK_MESSAGE,
  REGISTER_TOKEN_INVALID_MESSAGE,
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
 * Requests a workspace: an organization and a first administrator, pending
 * confirmation of the email address.
 *
 * `POST /auth/register-admin` is `permitAll` on the backend and takes no
 * credentials, so this touches no cookie and rotates nothing. Nothing is
 * created yet — the backend answers 202 identically whether or not the
 * address already has an account, and this function forwards exactly that:
 * no identifier comes back, because none exists until the address is
 * confirmed. See `confirmWorkspaceRegistration`.
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
): Promise<BackendResult<null>> {
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

  if (response.ok) return { ok: true, value: null };

  if (response.status === 400) {
    // Field-validation failures only — name/email/password/etc. shape. The
    // backend no longer answers differently for a taken address; there is no
    // enumeration signal left in this branch to preserve or to leak.
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

/** Exactly what `RegisterAdminResponse` provides, at the confirmation step. */
export type BackendWorkspaceRegistration = {
  readonly userId: string;
  readonly organizationId: string;
};

/**
 * Confirms a workspace registration and creates the organization and the
 * administrator account — the only point at which either comes into being.
 *
 * `POST /auth/register-admin/verify` is `permitAll` and takes no credentials.
 * Reached only by presenting the single-use token mailed to the address, so
 * returning identifiers here does not reopen the enumeration question
 * `registerWorkspace` closes: proving ownership of the token already proves
 * ownership of the address.
 */
export async function confirmWorkspaceRegistration(
  token: string,
): Promise<BackendResult<BackendWorkspaceRegistration>> {
  let response: Response;
  try {
    response = await callBackend({
      method: "POST",
      path: "/auth/register-admin/verify",
      body: { token },
    });
  } catch {
    return { ok: false, error: productAuthError("NETWORK", NETWORK_MESSAGE) };
  }

  if (response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const userId = readId(body, "userId");
    const organizationId = readId(body, "organizationId");
    if (!userId || !organizationId) {
      return { ok: false, error: productAuthError("SERVER", GENERIC_SERVER_MESSAGE) };
    }
    return { ok: true, value: { userId, organizationId } };
  }

  if (response.status === 400) {
    /*
      Every way the token can fail to redeem — unknown, expired, already
      used, or the address is now registered by some other means — collapses
      to one code, exactly like RESET_TOKEN_INVALID. Distinguishing them
      would hand back the oracle a single generic message exists to close.
    */
    const body: unknown = await response.json().catch(() => null);
    if (backendErrorCode(body) === "REGISTER_TOKEN_INVALID") {
      return {
        ok: false,
        error: productAuthError("REGISTER_TOKEN_INVALID", REGISTER_TOKEN_INVALID_MESSAGE),
      };
    }
    return {
      ok: false,
      error: productAuthError("VALIDATION", "Check the details and try again."),
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
 * `POST /auth/register-employee` is `permitAll`, takes no credentials
 * and returns no token pair — so this sets no cookie and creates no session.
 * The token travels as a body field, alongside the password, and is never
 * returned to the caller.
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
      /*
        A fixed path. The token used to be a segment of it, which meant this
        server's outbound URL — and every log, proxy and trace between here and
        the backend — carried a live credential. Encoding it made the path safe
        to *parse*; it did nothing about the path being recorded.

        It travels in the body now, beside the password, which is the only part
        of a request nothing here writes down.
      */
      path: "/auth/register-employee",
      body: { token: inviteToken, ...input },
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

  /*
    Classified by code, never by prose.

    This used to match the backend's message against `/invite/i`. The backend's
    sentence is "This invitation is not valid." — which happens to contain
    "invit", so the match worked by luck — and any rewording or translation
    would have silently reclassified a dead invitation as a validation error,
    putting the reader back in a form that can never succeed. A message is
    written for a person; a code is written for this branch.
  */
  if (response.status === 404) {
    return { ok: false, failure: "INVITE_INVALID", message: INVITE_INVALID_MESSAGE };
  }

  if (response.status === 400) {
    const body: unknown = await response.json().catch(() => null);
    if (backendErrorCode(body) === "INVITE_INVALID") {
      return { ok: false, failure: "INVITE_INVALID", message: INVITE_INVALID_MESSAGE };
    }
    return {
      ok: false,
      failure: "VALIDATION",
      message: safeBackendMessage(body) ?? "Check the details and try again.",
    };
  }

  return { ok: false, failure: "SERVER", message: GENERIC_SERVER_MESSAGE };
}

/**
 * The backend's stable failure identifier, if it sent one.
 *
 * Read defensively: this crosses a service boundary, so the field may be
 * absent, null, or not a string, and none of those is an error worth
 * reporting — they simply mean "no code", which falls through to the generic
 * branch.
 */
function backendErrorCode(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const code = (body as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
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
    /*
      400 covers both a rejected token and a password outside 8–72, and they
      are told apart by `code`, never by prose — the same rule
      `registerWithInvite` follows below, and for the same reason. This used
      to match the backend's message against `/password reset token/i`, which
      worked only because the backend's sentence happened to contain that
      phrase; rewording or translating it would have silently reclassified a
      dead token as a validation error, putting the reader back in a form that
      can never succeed.
    */
    const body: unknown = await response.json().catch(() => null);
    if (backendErrorCode(body) === "RESET_TOKEN_INVALID") {
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
