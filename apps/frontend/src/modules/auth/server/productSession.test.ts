import { describe, expect, it } from "vitest";

import type { BackendCurrentUser, BackendTokenPair } from "./backendAuth";
import { toProductUser } from "./productSession";

/**
 * Composing a product user is where a session is accepted or refused, so the
 * refusals matter as much as the successes.
 */

const BASE: BackendCurrentUser = {
  userId: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
  email: "mert@northwind.test",
  roles: ["EMPLOYEE", "PROJECT_MANAGER"],
};

describe("toProductUser", () => {
  it("composes identity and roles from /auth/me", () => {
    const user = toProductUser(BASE, "Mert Aydoğan");

    expect(user).toEqual({
      userId: BASE.userId,
      organizationId: BASE.organizationId,
      email: BASE.email,
      displayName: "Mert Aydoğan",
      roles: ["EMPLOYEE", "PROJECT_MANAGER"],
    });
  });

  it("drops a role the product does not model", () => {
    const user = toProductUser({ ...BASE, roles: ["EMPLOYEE", "GALACTIC_OVERLORD"] }, "Mert");

    expect(user?.roles).toEqual(["EMPLOYEE"]);
  });

  it("refuses a session that has no ordinary product role", () => {
    // SYSTEM_ADMIN has its own console. Narrowing leaves nothing, and an empty
    // role set is not a product session — it is a rejected one.
    expect(toProductUser({ ...BASE, roles: ["SYSTEM_ADMIN"] }, "Ada")).toBeNull();
  });

  it("keeps ordinary roles when SYSTEM_ADMIN arrives alongside them", () => {
    const user = toProductUser(
      { ...BASE, roles: ["SYSTEM_ADMIN", "EMPLOYEE", "DEPARTMENT_MANAGER"] },
      "Ada",
    );

    expect(user?.roles).toEqual(["EMPLOYEE", "DEPARTMENT_MANAGER"]);
  });

  it("refuses a session with no organization", () => {
    expect(toProductUser({ ...BASE, organizationId: null }, "Mert")).toBeNull();
  });

  it("falls back to the email when the display name is unavailable", () => {
    // The profile-name cookie can expire before the refresh cookie does.
    const user = toProductUser(BASE, null);

    expect(user?.displayName).toBe(BASE.email);
  });

  it("prefers the name carried by a login or refresh response", () => {
    const tokens: BackendTokenPair = {
      accessToken: "access-fixture",
      refreshToken: "refresh-fixture",
      tokenType: "Bearer",
      expiresInSeconds: 900,
      userId: BASE.userId,
      organizationId: BASE.organizationId,
      name: "Mert Aydoğan",
      email: BASE.email,
      roles: ["EMPLOYEE"],
    };

    // TokenPairResponse carries the name; /auth/me does not.
    expect(toProductUser(tokens, null)?.displayName).toBe("Mert Aydoğan");
  });

  it("never invents an organization name", () => {
    const user = toProductUser(BASE, "Mert");

    expect(user).not.toHaveProperty("organizationName");
    expect(JSON.stringify(user)).not.toContain("Northwind");
  });

  it("exposes nothing that could hold a token", () => {
    const serialized = JSON.stringify(toProductUser(BASE, "Mert"));

    expect(serialized).not.toContain("accessToken");
    expect(serialized).not.toContain("refreshToken");
    expect(serialized).not.toContain("Bearer");
  });
});
