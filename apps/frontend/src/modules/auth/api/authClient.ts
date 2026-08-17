import type { ProductAuthError } from "../model/errors";
import { GENERIC_SERVER_MESSAGE, NETWORK_MESSAGE, productAuthError } from "../model/errors";
import type { ProductSession, ProductUser } from "../model/session";

/**
 * The browser's view of authentication.
 *
 * Every call goes to a same-origin BFF route — never to the Spring backend, and
 * never with a token, because the browser does not have one and never will. This
 * file is the reason product modules can stay unaware that tokens exist at all.
 */

type ErrorEnvelope = { readonly error?: ProductAuthError };

async function readError(response: Response): Promise<ProductAuthError> {
  try {
    const body = (await response.json()) as ErrorEnvelope;
    if (body.error?.code && body.error?.message) return body.error;
  } catch {
    // A malformed error body is itself a server problem.
  }
  return productAuthError("SERVER", GENERIC_SERVER_MESSAGE);
}

export type LoginOutcome =
  | { readonly ok: true; readonly user: ProductUser }
  | { readonly ok: false; readonly error: ProductAuthError };

export async function signIn(email: string, password: string): Promise<LoginOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return { ok: false, error: productAuthError("NETWORK", NETWORK_MESSAGE) };
  }

  if (!response.ok) return { ok: false, error: await readError(response) };

  const body = (await response.json()) as { user: ProductUser };
  return { ok: true, user: body.user };
}

export type CreateWorkspaceOutcome =
  | { readonly ok: true; readonly email: string }
  | {
      readonly ok: false;
      readonly error: ProductAuthError;
      readonly fieldErrors?: Record<string, string>;
    };

/**
 * Creates an organization and its first administrator.
 *
 * Returns the email the account was created with so the success screen can name
 * it. No token crosses this boundary because the backend issues none here — the
 * new administrator signs in afterwards like anybody else.
 */
export async function createWorkspace(input: {
  name: string;
  email: string;
  password: string;
  organizationName: string;
  headquarterAddress: string;
}): Promise<CreateWorkspaceOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/auth/register-workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    return { ok: false, error: productAuthError("NETWORK", NETWORK_MESSAGE) };
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: ProductAuthError;
      fieldErrors?: Record<string, string>;
    } | null;
    return {
      ok: false,
      error: body?.error ?? productAuthError("SERVER", GENERIC_SERVER_MESSAGE),
      fieldErrors: body?.fieldErrors,
    };
  }

  const body = (await response.json()) as { email: string };
  return { ok: true, email: body.email };
}

export async function signOut(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // The cookies are cleared server-side; a failed call still ends with the
    // browser being sent to login by the caller.
  }
}

export async function fetchSession(): Promise<ProductSession> {
  try {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    if (!response.ok) return { authenticated: false };
    return (await response.json()) as ProductSession;
  } catch {
    return { authenticated: false };
  }
}

export type SimpleOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: ProductAuthError };

export async function requestPasswordReset(email: string): Promise<SimpleOutcome> {
  try {
    const response = await fetch("/api/auth/password-reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return response.ok ? { ok: true } : { ok: false, error: await readError(response) };
  } catch {
    return { ok: false, error: productAuthError("NETWORK", NETWORK_MESSAGE) };
  }
}

export async function confirmPasswordReset(
  token: string,
  newPassword: string,
): Promise<SimpleOutcome> {
  try {
    const response = await fetch("/api/auth/password-reset/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword }),
    });
    return response.ok ? { ok: true } : { ok: false, error: await readError(response) };
  } catch {
    return { ok: false, error: productAuthError("NETWORK", NETWORK_MESSAGE) };
  }
}
