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
