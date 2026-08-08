import { describe, expect, it } from "vitest";

import type { BackendTokenPair } from "./backendAuth";
import { toProductUser } from "./productSession";

/**
 * The hard acceptance condition of the whole BFF: **a token must never reach the
 * browser**. Cookies carry them, HttpOnly keeps them unreadable, and no response
 * body may contain one.
 *
 * These assertions run against the exact object the login and session routes
 * serialize, so a future field that happened to carry a token would fail here
 * rather than in production.
 */

const TOKENS: BackendTokenPair = {
  accessToken: "access-token-fixture-must-not-leak",
  refreshToken: "refresh-token-fixture-must-not-leak",
  tokenType: "Bearer",
  expiresInSeconds: 900,
  userId: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
  name: "Mert Aydoğan",
  email: "mert@northwind.test",
  roles: ["EMPLOYEE", "PROJECT_MANAGER"],
};

describe("no token leaves the BFF", () => {
  it("the login response body contains neither token", () => {
    const user = toProductUser(TOKENS, TOKENS.name);
    // Exactly what app/api/auth/login/route.ts returns.
    const body = JSON.stringify({ authenticated: true, user });

    expect(body).not.toContain(TOKENS.accessToken);
    expect(body).not.toContain(TOKENS.refreshToken);
    expect(body).not.toContain("accessToken");
    expect(body).not.toContain("refreshToken");
  });

  it("the session response body contains neither token", () => {
    const user = toProductUser(TOKENS, TOKENS.name);
    // Exactly what app/api/auth/session/route.ts returns.
    const body = JSON.stringify({ authenticated: true, user });

    expect(body).not.toContain(TOKENS.accessToken);
    expect(body).not.toContain(TOKENS.refreshToken);
  });

  it("carries no field that could hold a credential", () => {
    const user = toProductUser(TOKENS, TOKENS.name);

    expect(Object.keys(user ?? {}).sort()).toEqual([
      "displayName",
      "email",
      "organizationId",
      "roles",
      "userId",
    ]);
  });

  it("does not expose the token type or expiry, which are BFF concerns", () => {
    const body = JSON.stringify(toProductUser(TOKENS, TOKENS.name));

    expect(body).not.toContain("Bearer");
    expect(body).not.toContain("expiresInSeconds");
  });
});
