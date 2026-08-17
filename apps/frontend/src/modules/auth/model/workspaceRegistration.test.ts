import { describe, expect, it } from "vitest";

import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  validateWorkspaceRegistration,
} from "./workspaceRegistration";

/**
 * The workspace-registration rules.
 *
 * These bounds exist to match the backend's, so the form can answer obvious
 * mistakes without a round trip. The backend re-validates everything and stays
 * the authority — these tests pin the mirror, not the decision.
 */

const VALID = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  password: "correct-horse-battery",
  organizationName: "Analytical Engines",
  headquarterAddress: "1 Marylebone Road, London",
};

describe("accepting a workspace", () => {
  it("accepts a complete, plausible submission", () => {
    const result = validateWorkspaceRegistration(VALID);

    expect(result.ok).toBe(true);
  });

  it("trims surrounding whitespace so a stray space is not an error", () => {
    const result = validateWorkspaceRegistration({ ...VALID, name: "  Ada Lovelace  " });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.name).toBe("Ada Lovelace");
  });

  it("never trims the password, because spaces may be part of it", () => {
    const spaced = " a pass phrase ";
    const result = validateWorkspaceRegistration({ ...VALID, password: spaced });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.password).toBe(spaced);
  });
});

describe("refusing an incomplete workspace", () => {
  it.each(["name", "email", "password", "organizationName", "headquarterAddress"] as const)(
    "requires %s",
    (field) => {
      const result = validateWorkspaceRegistration({ ...VALID, [field]: "" });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[field]).toBeTruthy();
    },
  );

  it("reports every problem at once rather than one per attempt", () => {
    const result = validateWorkspaceRegistration({});

    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors)).toHaveLength(5);
  });

  it("rejects an address that is not one", () => {
    const result = validateWorkspaceRegistration({ ...VALID, email: "ada-at-example" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.email).toBeTruthy();
  });

  it("accepts unusual but valid addresses rather than guessing", () => {
    // A regex that rejects a deliverable address is worse than one that accepts
    // an undeliverable one — the mail server is the real authority.
    const result = validateWorkspaceRegistration({
      ...VALID,
      email: "ada+workspace@sub.domain.example",
    });

    expect(result.ok).toBe(true);
  });
});

describe("the password bounds, which are the backend's", () => {
  it(`refuses fewer than ${PASSWORD_MIN} characters`, () => {
    const result = validateWorkspaceRegistration({
      ...VALID,
      password: "a".repeat(PASSWORD_MIN - 1),
    });

    expect(result.ok).toBe(false);
  });

  it(`accepts exactly ${PASSWORD_MIN} characters`, () => {
    const result = validateWorkspaceRegistration({
      ...VALID,
      password: "a".repeat(PASSWORD_MIN),
    });

    expect(result.ok).toBe(true);
  });

  it(`accepts exactly ${PASSWORD_MAX} characters`, () => {
    const result = validateWorkspaceRegistration({
      ...VALID,
      password: "a".repeat(PASSWORD_MAX),
    });

    expect(result.ok).toBe(true);
  });

  it(`refuses more than ${PASSWORD_MAX}, rather than silently truncating`, () => {
    // The backend's ceiling is bcrypt's 72 bytes. Truncating here would create a
    // password that cannot be typed back in.
    const result = validateWorkspaceRegistration({
      ...VALID,
      password: "a".repeat(PASSWORD_MAX + 1),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.password).toBeTruthy();
  });
});

describe("length ceilings that mirror the backend's columns", () => {
  it.each([
    ["name", 120],
    ["email", 180],
    ["organizationName", 160],
    ["headquarterAddress", 1000],
  ] as const)("refuses %s longer than %i", (field, max) => {
    const tooLong =
      field === "email" ? `${"a".repeat(max)}@example.com` : "a".repeat(max + 1);

    const result = validateWorkspaceRegistration({ ...VALID, [field]: tooLong });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[field]).toBeTruthy();
  });
});

describe("what the validator refuses to assume", () => {
  it("treats non-string input as absent rather than coercing it", () => {
    const result = validateWorkspaceRegistration({
      ...VALID,
      name: 42 as unknown as string,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.name).toBeTruthy();
  });

  it("ignores extra fields instead of forwarding them to the backend", () => {
    const result = validateWorkspaceRegistration({
      ...VALID,
      role: "SYSTEM_ADMIN",
      organizationId: "someone-elses-org",
    } as never);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Only the five contract fields survive — a caller cannot smuggle a role
      // or an organization id through the form.
      expect(Object.keys(result.value).sort()).toEqual([
        "email",
        "headquarterAddress",
        "name",
        "organizationName",
        "password",
      ]);
    }
  });
});
