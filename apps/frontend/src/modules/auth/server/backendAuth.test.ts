import { beforeEach, describe, expect, it, vi } from "vitest";

import { confirmPasswordReset, registerWithInvite } from "./backendAuth";

/**
 * What this server puts on the wire when it forwards a credential.
 *
 * The BFF is a second place a token can leak, and a quieter one: its outbound
 * URL is written to this process's own logs, to any egress proxy, and to the
 * backend's access log. Both of these calls used to be safe on the browser side
 * and unsafe here — the invite token was a path segment of the backend URL.
 *
 * The rule is the same on both hops: a credential travels in the body.
 */

const TOKEN = "invite-token-value-abc123";
const RESET_TOKEN = "reset-token-value-abc123";

function mockFetch(status = 201, body: unknown = { userId: "u-1", organizationId: "o-1" }) {
  const spy = vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    json: async () => body,
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("forwarding an invitation", () => {
  it("addresses a fixed path and puts the token in the body", async () => {
    const fetchSpy = mockFetch();

    await registerWithInvite(
      TOKEN,
      { name: "Ada", email: "ada@example.com", password: "correct-horse" },
      null,
    );

    const [url, init] = fetchSpy.mock.calls[0];

    expect(String(url)).toMatch(/\/auth\/register-employee$/);
    expect(String(url)).not.toContain(TOKEN);
    expect(String(url)).not.toContain("token=");

    const sent = JSON.parse(String(init.body));
    expect(sent.token).toBe(TOKEN);
    expect(sent.email).toBe("ada@example.com");
  });

  it("puts the token in no header either", async () => {
    const fetchSpy = mockFetch();

    await registerWithInvite(
      TOKEN,
      { name: "Ada", email: "ada@example.com", password: "correct-horse" },
      "Mozilla/5.0",
    );

    const headers = fetchSpy.mock.calls[0][1].headers as Record<string, string>;
    for (const value of Object.values(headers)) {
      expect(value).not.toContain(TOKEN);
    }
  });

  it("returns no token to its caller, on success or failure", async () => {
    mockFetch();
    const created = await registerWithInvite(
      TOKEN, { name: "Ada", email: "ada@example.com", password: "correct-horse" }, null,
    );
    expect(JSON.stringify(created)).not.toContain(TOKEN);

    for (const status of [400, 401, 404, 500]) {
      mockFetch(status, { message: "no" });
      const failed = await registerWithInvite(
        TOKEN, { name: "Ada", email: "ada@example.com", password: "correct-horse" }, null,
      );
      expect(JSON.stringify(failed)).not.toContain(TOKEN);
    }
  });
});

describe("forwarding a password reset", () => {
  it("addresses a fixed path and puts the token in the body", async () => {
    const fetchSpy = mockFetch(204, null);

    await confirmPasswordReset(RESET_TOKEN, "correct-horse-battery");

    const [url, init] = fetchSpy.mock.calls[0];

    expect(String(url)).toMatch(/\/auth\/password-reset\/confirm$/);
    expect(String(url)).not.toContain(RESET_TOKEN);
    expect(String(url)).not.toContain("token=");
    expect(JSON.parse(String(init.body)).token).toBe(RESET_TOKEN);
  });
});

describe("classifying an invitation failure", () => {
  /**
   * The envelope below is the backend's real one — the field names and order
   * `ApiErrorResponse` serialises — rather than a shape invented here. A
   * contract test that asserts against a hand-written body proves the two ends
   * agree with the test, not with each other.
   */
  function backendError(overrides: Record<string, unknown> = {}) {
    return {
      timestamp: "2026-08-24T00:00:00.000+00:00",
      status: 400,
      error: "Bad Request",
      message: "This invitation is not valid.",
      path: "/auth/register-employee",
      code: "INVITE_INVALID",
      ...overrides,
    };
  }

  async function classify(body: unknown, status = 400) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status,
      json: async () => body,
    }));
    return registerWithInvite(
      TOKEN, { name: "Ada", email: "ada@example.com", password: "correct-horse" }, null,
    );
  }

  it("reads the code, not the sentence", async () => {
    const outcome = await classify(backendError());

    expect(outcome).toMatchObject({ ok: false, failure: "INVITE_INVALID" });
  });

  it("still classifies when the sentence is reworded or translated", async () => {
    /*
      The regression this replaces matched /invite/i against the message. Any
      rewording — or a translation, which is the realistic case — reclassified a
      dead invitation as a validation error and put the reader back into a form
      that could never succeed.
    */
    for (const message of [
      "Bu davet geçerli değil.",
      "Das ist nicht mehr gültig.",
      "Nope.",
    ]) {
      const outcome = await classify(backendError({ message }));
      expect(outcome).toMatchObject({ failure: "INVITE_INVALID" });
    }
  });

  it("does not classify by prose when the code says otherwise", async () => {
    // A genuine validation failure that happens to mention an invitation.
    const outcome = await classify(
      backendError({ code: undefined, message: "The invite form is incomplete." }),
    );

    expect(outcome).toMatchObject({ failure: "VALIDATION" });
  });

  it("falls back safely when the backend sends no code at all", async () => {
    const outcome = await classify(backendError({ code: undefined }));

    expect(outcome).toMatchObject({ ok: false, failure: "VALIDATION" });
  });

  it("reports one message to the browser whatever the backend said", async () => {
    const outcome = await classify(backendError({ message: "consumed at 12:04 by ada@x" }));

    expect(JSON.stringify(outcome)).not.toContain("12:04");
    expect(JSON.stringify(outcome)).not.toContain("ada@x");
  });
});
