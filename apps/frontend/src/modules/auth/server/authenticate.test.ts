import { describe, expect, it, vi } from "vitest";

import { authenticateForProduct } from "./authenticate";
import type { BackendResult, BackendTokenPair } from "./backendAuth";

/**
 * A login the product refuses still created a backend session, because the
 * credentials were correct. Leaving it alive would strand a session nobody can
 * see or revoke — so it is closed. That cleanup is invisible from the outside
 * (the caller is refused either way), which is exactly why it is tested here.
 *
 * Fixture tokens are obviously fake and are never printed.
 */

const ISSUED_ACCESS_TOKEN = "issued-access-token-fixture";

function tokens(roles: readonly string[], organizationId: string | null = "org-1"): BackendTokenPair {
  return {
    accessToken: ISSUED_ACCESS_TOKEN,
    refreshToken: "issued-refresh-token-fixture",
    tokenType: "Bearer",
    expiresInSeconds: 900,
    userId: "11111111-1111-4111-8111-111111111111",
    organizationId,
    name: "Ada Lovelace",
    email: "ada@northwind.test",
    roles,
  };
}

function dependencies(result: BackendResult<BackendTokenPair>) {
  return {
    login: vi.fn(async () => result),
    logout: vi.fn(async () => undefined),
  };
}

describe("authenticateForProduct", () => {
  it("returns the user and never calls logout for an ordinary product session", async () => {
    const deps = dependencies({ ok: true, value: tokens(["EMPLOYEE", "PROJECT_MANAGER"]) });

    const outcome = await authenticateForProduct("ada@northwind.test", "pw", null, deps);

    expect(outcome.ok).toBe(true);
    expect(deps.logout).not.toHaveBeenCalled();
  });

  it("revokes the new backend session when only SYSTEM_ADMIN is returned", async () => {
    const deps = dependencies({ ok: true, value: tokens(["SYSTEM_ADMIN"]) });

    const outcome = await authenticateForProduct("ada@northwind.test", "pw", null, deps);

    expect(outcome.ok).toBe(false);
    // Exactly once, with the token that was just issued — anything else would
    // leave the session alive or revoke the wrong one.
    expect(deps.logout).toHaveBeenCalledTimes(1);
    expect(deps.logout).toHaveBeenCalledWith(ISSUED_ACCESS_TOKEN);
  });

  it("revokes the new backend session when the user has no organization", async () => {
    const deps = dependencies({ ok: true, value: tokens(["EMPLOYEE"], null) });

    const outcome = await authenticateForProduct("ada@northwind.test", "pw", null, deps);

    expect(outcome.ok).toBe(false);
    expect(deps.logout).toHaveBeenCalledTimes(1);
  });

  it("refuses a rejected session with the same wording as a wrong password", async () => {
    const deps = dependencies({ ok: true, value: tokens(["SYSTEM_ADMIN"]) });

    const outcome = await authenticateForProduct("ada@northwind.test", "pw", null, deps);

    // Saying "this account cannot use the product" would confirm the address exists.
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.message).toBe("Invalid email or password.");
    }
  });

  it("never puts a token in the refusal", async () => {
    const deps = dependencies({ ok: true, value: tokens(["SYSTEM_ADMIN"]) });

    const outcome = await authenticateForProduct("ada@northwind.test", "pw", null, deps);

    expect(JSON.stringify(outcome)).not.toContain(ISSUED_ACCESS_TOKEN);
    expect(JSON.stringify(outcome)).not.toContain("refresh-token");
  });

  it("does not attempt cleanup when the credentials were wrong", async () => {
    const deps = dependencies({
      ok: false,
      error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." },
    });

    const outcome = await authenticateForProduct("ada@northwind.test", "wrong", null, deps);

    expect(outcome.ok).toBe(false);
    // No session was created, so there is nothing to revoke.
    expect(deps.logout).not.toHaveBeenCalled();
  });

  it("still refuses when the cleanup itself fails", async () => {
    const deps = {
      login: vi.fn(async (): Promise<BackendResult<BackendTokenPair>> => ({
        ok: true,
        value: tokens(["SYSTEM_ADMIN"]),
      })),
      logout: vi.fn(async () => {
        throw new Error("backend unreachable");
      }),
    };

    // The refusal is what protects the browser; a failed cleanup must not turn
    // into a 500 for a request that was going to be refused anyway.
    const outcome = await authenticateForProduct("ada@northwind.test", "pw", null, deps);

    expect(outcome.ok).toBe(false);
    expect(deps.logout).toHaveBeenCalledTimes(1);
  });
});
