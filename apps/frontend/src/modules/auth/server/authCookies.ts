import "server-only";

import type { NextResponse } from "next/server";

import {
  ACCESS_COOKIE_SKEW_SECONDS,
  COOKIE_NAMES,
  REFRESH_COOKIE_MAX_AGE_SECONDS,
  secureCookiesEnabled,
} from "./authConfig";
import type { BackendTokenPair } from "./backendAuth";

/**
 * The product's cookie policy, in one place.
 *
 * Every auth cookie is `HttpOnly`, so nothing the browser runs can read a token
 * — that is the whole point of the BFF. `SameSite=Lax` keeps them off
 * cross-site requests while still surviving ordinary top-level navigation, and
 * `Secure` is set wherever the origin is HTTPS.
 */

type CookieOptions = {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  secure: boolean;
  maxAge: number;
};

function baseOptions(maxAge: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: secureCookiesEnabled(),
    maxAge,
  };
}

/**
 * The access cookie expires a little before the JWT does, so the browser stops
 * presenting a token the backend is about to reject. The lifetime comes from the
 * backend's own `expiresInSeconds`; only the margin is ours.
 */
export function accessCookieMaxAge(expiresInSeconds: number): number {
  return Math.max(1, Math.floor(expiresInSeconds) - ACCESS_COOKIE_SKEW_SECONDS);
}

/** Writes a fresh token pair and the display name onto a response. */
export function applyTokenPair(response: NextResponse, tokens: BackendTokenPair): void {
  response.cookies.set(
    COOKIE_NAMES.access,
    tokens.accessToken,
    baseOptions(accessCookieMaxAge(tokens.expiresInSeconds)),
  );
  response.cookies.set(
    COOKIE_NAMES.refresh,
    tokens.refreshToken,
    baseOptions(REFRESH_COOKIE_MAX_AGE_SECONDS),
  );
  // Display metadata only. Never consulted for authorization or roles.
  response.cookies.set(
    COOKIE_NAMES.profileName,
    tokens.name,
    baseOptions(REFRESH_COOKIE_MAX_AGE_SECONDS),
  );
}

/**
 * Removes every product auth cookie. Used on sign-out and whenever the session
 * turns out to be unrecoverable — a browser that looks signed in but is not is
 * worse than one that is plainly signed out.
 */
export function clearAuthCookies(response: NextResponse): void {
  for (const name of Object.values(COOKIE_NAMES)) {
    response.cookies.set(name, "", { ...baseOptions(0), maxAge: 0 });
  }
}
