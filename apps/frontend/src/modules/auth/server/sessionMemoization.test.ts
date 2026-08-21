import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `resolveProductSession` is wrapped in React's per-request `cache()`.
 *
 * **What proves the deduplication is a live measurement, not this file.**
 * `cache()` only memoizes inside a React request context; under vitest there is
 * none, so every call here is a miss and a call-count assertion would be
 * measuring the test environment rather than the app. The real numbers for one
 * `/account` render were taken against a local backend:
 *
 * ```
 * before   2 × GET /auth/me   + 1 × GET /auth/sessions
 * after    1 × GET /auth/me   + 1 × GET /auth/sessions
 * ```
 *
 * What this file pins is the part that matters if the memo ever misbehaves: it
 * must not change *what* a session resolves to. A memo that answered the wrong
 * request would be far worse than a duplicated read, so these tests run with the
 * memo inert — the worst case — and check the answers are still right.
 */

const currentUser = vi.fn();
const cookieStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieStore.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));

vi.mock("./backendAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./backendAuth")>();
  return { ...actual, currentUser: (token: string) => currentUser(token) };
});

const OK = {
  ok: true as const,
  value: {
    userId: "11111111-1111-4111-8111-111111111111",
    organizationId: "22222222-2222-4222-8222-222222222222",
    email: "mert@northwind.test",
    roles: ["EMPLOYEE", "ORGANIZATION_ADMIN"],
  },
};

const REFUSED = { ok: false as const, error: { code: "UNAUTHENTICATED" } };

beforeEach(() => {
  vi.resetModules();
  currentUser.mockReset();
  cookieStore.clear();
  cookieStore.set("potriv_access_token", "access-token-value");
});

/** A fresh module registry stands in for a fresh request. */
async function freshRequest() {
  vi.resetModules();
  const mod = await import("./productSession");
  return mod.resolveProductSession;
}

describe("identity is the same whoever asks", () => {
  it("gives every caller in a request the same session", async () => {
    currentUser.mockResolvedValue(OK);
    const resolve = await freshRequest();

    // Layout, then page, then anything else in the same render.
    const [a, b, c] = await Promise.all([resolve(), resolve(), resolve()]);

    expect(a).toEqual(b);
    expect(b).toEqual(c);
    expect(a.authenticated).toBe(true);
  });
});

describe("nothing survives into a different request", () => {
  it("does not carry an authenticated answer into a request with no cookie", async () => {
    currentUser.mockResolvedValue(OK);
    const first = await freshRequest();
    expect((await first()).authenticated).toBe(true);

    cookieStore.clear();
    const second = await freshRequest();
    const session = await second();

    // No cookie means no backend call at all — nothing can manufacture a
    // session from a previous request's answer.
    expect(session.authenticated).toBe(false);
    expect(currentUser).toHaveBeenCalledTimes(1);
  });

  it("does not pin a refusal onto a later valid request", async () => {
    currentUser.mockResolvedValue(REFUSED);
    const first = await freshRequest();
    expect((await first()).authenticated).toBe(false);

    currentUser.mockResolvedValue(OK);
    const second = await freshRequest();
    expect((await second()).authenticated).toBe(true);
  });
});

describe("expiry still ends the session", () => {
  it("reports unauthenticated when the backend refuses the token", async () => {
    currentUser.mockResolvedValue(REFUSED);
    const resolve = await freshRequest();

    expect((await resolve()).authenticated).toBe(false);
  });

  it("stays a pure read — no refresh, no mutation", async () => {
    currentUser.mockResolvedValue(REFUSED);
    const resolve = await freshRequest();

    await resolve();

    // Exactly the identity read. Memoizing must not have turned a read into
    // something that can change auth state.
    expect(currentUser).toHaveBeenCalledTimes(1);
    expect(currentUser).toHaveBeenCalledWith("access-token-value");
  });
});
