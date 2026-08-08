import { describe, expect, it, vi } from "vitest";

import { authenticateForProduct } from "./authenticate";
import type { BackendResult, BackendTokenPair } from "./backendAuth";
import { loginFailureStatus } from "./loginOutcome";

/**
 * A wrong password and a correct password on an ineligible account must look
 * identical from outside.
 *
 * The second case is the dangerous one: the backend authenticated the
 * credentials, so any difference the browser can observe — status, code,
 * message, shape — confirms that this email and password are valid. That turns
 * the login form into an oracle, which is precisely what the backend's uniform
 * login error exists to prevent.
 *
 * FE-02A answered 403 for it. This compares the two responses field by field so
 * that regression cannot come back quietly.
 */

const ISSUED_ACCESS_TOKEN = "issued-access-token-fixture";

function tokens(roles: readonly string[]): BackendTokenPair {
  return {
    accessToken: ISSUED_ACCESS_TOKEN,
    refreshToken: "issued-refresh-token-fixture",
    tokenType: "Bearer",
    expiresInSeconds: 900,
    userId: "11111111-1111-4111-8111-111111111111",
    organizationId: "22222222-2222-4222-8222-222222222222",
    name: "Ada Lovelace",
    email: "ada@northwind.test",
    roles,
  };
}

/** A. the password is simply wrong — the backend never authenticated anything. */
async function wrongPassword() {
  const logout = vi.fn(async () => undefined);
  const outcome = await authenticateForProduct("ada@northwind.test", "wrong", null, {
    login: async (): Promise<BackendResult<BackendTokenPair>> => ({
      ok: false,
      error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." },
    }),
    logout,
  });
  return { outcome, logout };
}

/** B. the password is correct, but the resulting session is not a product one. */
async function rejectedValidLogin() {
  const logout = vi.fn(async () => undefined);
  const outcome = await authenticateForProduct("ada@northwind.test", "correct", null, {
    login: async (): Promise<BackendResult<BackendTokenPair>> => ({
      ok: true,
      value: tokens(["SYSTEM_ADMIN"]),
    }),
    logout,
  });
  return { outcome, logout };
}

describe("login does not become a credential oracle", () => {
  it("gives both cases the same public status", async () => {
    const a = await wrongPassword();
    const b = await rejectedValidLogin();

    expect(a.outcome.ok).toBe(false);
    expect(b.outcome.ok).toBe(false);
    if (a.outcome.ok || b.outcome.ok) return;

    expect(loginFailureStatus(b.outcome.error.code)).toBe(
      loginFailureStatus(a.outcome.error.code),
    );
    expect(loginFailureStatus(b.outcome.error.code)).toBe(401);
  });

  it("gives both cases the same public error code and message", async () => {
    const a = await wrongPassword();
    const b = await rejectedValidLogin();
    if (a.outcome.ok || b.outcome.ok) throw new Error("both must fail");

    expect(b.outcome.error.code).toBe(a.outcome.error.code);
    expect(b.outcome.error.message).toBe(a.outcome.error.message);
    expect(b.outcome.error.message).toBe("Invalid email or password.");
  });

  it("gives both cases an identical public response body", async () => {
    const a = await wrongPassword();
    const b = await rejectedValidLogin();
    if (a.outcome.ok || b.outcome.ok) throw new Error("both must fail");

    // Exactly what the route serializes.
    expect(JSON.stringify({ error: b.outcome.error })).toBe(
      JSON.stringify({ error: a.outcome.error }),
    );
  });

  it("keeps the difference internal, where the cleanup needs it", async () => {
    const a = await wrongPassword();
    const b = await rejectedValidLogin();
    if (a.outcome.ok || b.outcome.ok) throw new Error("both must fail");

    // Distinguishable to this module, and to nothing the browser sees.
    expect(a.outcome.internalReason).toBe("BACKEND_REJECTED");
    expect(b.outcome.internalReason).toBe("PRODUCT_INELIGIBLE");
  });

  it("revokes the backend session only in the case that created one", async () => {
    const a = await wrongPassword();
    const b = await rejectedValidLogin();

    expect(a.logout).not.toHaveBeenCalled();
    expect(b.logout).toHaveBeenCalledTimes(1);
    expect(b.logout).toHaveBeenCalledWith(ISSUED_ACCESS_TOKEN);
  });

  it("leaks no token through either refusal", async () => {
    const b = await rejectedValidLogin();

    expect(JSON.stringify(b.outcome.ok ? {} : { error: b.outcome.error })).not.toContain(
      ISSUED_ACCESS_TOKEN,
    );
  });

  it("still distinguishes an upstream failure, which reveals nothing", async () => {
    const logout = vi.fn(async () => undefined);
    const outcome = await authenticateForProduct("ada@northwind.test", "pw", null, {
      login: async (): Promise<BackendResult<BackendTokenPair>> => ({
        ok: false,
        error: { code: "NETWORK", message: "Could not reach Potriv." },
      }),
      logout,
    });

    if (outcome.ok) throw new Error("must fail");
    // Safe to distinguish: it says nothing about the credentials.
    expect(loginFailureStatus(outcome.error.code)).toBe(502);
    expect(outcome.internalReason).toBe("UPSTREAM");
  });
});
