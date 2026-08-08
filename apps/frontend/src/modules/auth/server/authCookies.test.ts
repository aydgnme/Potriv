import { NextResponse } from "next/server";
import { describe, expect, it } from "vitest";

import { ACCESS_COOKIE_SKEW_SECONDS, COOKIE_NAMES } from "./authConfig";
import { accessCookieMaxAge, applyTokenPair, clearAuthCookies } from "./authCookies";
import type { BackendTokenPair } from "./backendAuth";

/**
 * The cookie policy is the whole security boundary of the BFF, so it is asserted
 * rather than assumed. Fixture token values are obviously fake and are never
 * printed.
 */

const TOKENS: BackendTokenPair = {
  accessToken: "access-token-fixture",
  refreshToken: "refresh-token-fixture",
  tokenType: "Bearer",
  expiresInSeconds: 900,
  userId: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
  name: "Mert Aydoğan",
  email: "mert@northwind.test",
  roles: ["EMPLOYEE"],
};

describe("accessCookieMaxAge", () => {
  it("derives the lifetime from the backend's expiresInSeconds", () => {
    expect(accessCookieMaxAge(900)).toBe(900 - ACCESS_COOKIE_SKEW_SECONDS);
  });

  it("expires slightly before the JWT so a doomed token is not presented", () => {
    expect(accessCookieMaxAge(900)).toBeLessThan(900);
  });

  it("never returns a non-positive lifetime, which would delete the cookie", () => {
    expect(accessCookieMaxAge(5)).toBeGreaterThan(0);
    expect(accessCookieMaxAge(0)).toBeGreaterThan(0);
  });
});

describe("applyTokenPair", () => {
  it("marks every auth cookie HttpOnly, SameSite=Lax and path-wide", () => {
    const response = NextResponse.json({});
    applyTokenPair(response, TOKENS);

    for (const name of Object.values(COOKIE_NAMES)) {
      const cookie = response.cookies.get(name);
      expect(cookie, `${name} must be set`).toBeDefined();
      // HttpOnly is what stops product JavaScript reading a token at all.
      expect(cookie?.httpOnly, `${name} must be HttpOnly`).toBe(true);
      expect(cookie?.sameSite, `${name} must be SameSite=Lax`).toBe("lax");
      expect(cookie?.path).toBe("/");
    }
  });

  it("gives the access cookie the backend-derived lifetime", () => {
    const response = NextResponse.json({});
    applyTokenPair(response, TOKENS);

    expect(response.cookies.get(COOKIE_NAMES.access)?.maxAge).toBe(
      accessCookieMaxAge(TOKENS.expiresInSeconds),
    );
  });

  it("stores the display name separately from the credentials", () => {
    const response = NextResponse.json({});
    applyTokenPair(response, TOKENS);

    expect(response.cookies.get(COOKIE_NAMES.profileName)?.value).toBe(TOKENS.name);
  });
});

describe("clearAuthCookies", () => {
  it("removes every auth cookie, leaving nothing that looks signed in", () => {
    const response = NextResponse.json({});
    applyTokenPair(response, TOKENS);
    clearAuthCookies(response);

    for (const name of Object.values(COOKIE_NAMES)) {
      const cookie = response.cookies.get(name);
      expect(cookie?.value).toBe("");
      expect(cookie?.maxAge).toBe(0);
    }
  });
});
