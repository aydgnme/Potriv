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
