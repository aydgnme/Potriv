import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `POST /api/auth/logout-all`.
 *
 * The route that ends every session. Two properties matter most and both are
 * easy to get subtly wrong: it must never be reachable cross-origin, and it must
 * never claim the remote revocation happened when it did not.
 */

const logoutAll = vi.fn();
const clearAuthCookies = vi.fn();
const isSameOrigin = vi.fn();

vi.mock("@/modules/auth/server/backendAuth", () => ({
  logoutAll: (token: string) => logoutAll(token),
}));

vi.mock("@/modules/auth/server/authCookies", () => ({
  clearAuthCookies: (response: unknown) => clearAuthCookies(response),
}));

vi.mock("@/modules/auth/server/sameOrigin", () => ({
  isSameOrigin: (request: unknown) => isSameOrigin(request),
}));

/** Just enough of NextRequest for this route: an access cookie. */
function request(accessToken?: string) {
  return {
    cookies: {
      get: (name: string) =>
        name === "potriv_access_token" && accessToken !== undefined
          ? { name, value: accessToken }
          : undefined,
    },
  };
}

async function post(accessToken?: string) {
  const { POST } = await import("../../../../app/api/auth/logout-all/route");
  /*
    A deliberate double assertion, and it is worth naming as one: `as unknown as
    NextRequest` bypasses structural checking exactly as completely as the `any`
    it replaced. Nothing here is compiler-verified.

    It stays because the route reads one property — the access cookie — and
    constructing a real `NextRequest` would mean building a whole Request just to
    exercise `cookies.get`. The narrow stub is honest about what it covers; the
    cast is not evidence of anything.
  */
  return POST(request(accessToken) as unknown as NextRequest);
}

beforeEach(() => {
  vi.resetModules();
  logoutAll.mockReset().mockResolvedValue(true);
  clearAuthCookies.mockReset();
  isSameOrigin.mockReset().mockReturnValue(true);
});

describe("origin", () => {
  it("refuses a cross-origin caller before revoking anything", async () => {
    isSameOrigin.mockReturnValue(false);

    const response = await post("token");

    expect(response.status).toBe(403);
    expect(logoutAll).not.toHaveBeenCalled();
    expect(clearAuthCookies).not.toHaveBeenCalled();
  });

  it("exposes only POST — there is no GET handler to trigger with a link", async () => {
    const route = await import("../../../../app/api/auth/logout-all/route");

    expect(typeof route.POST).toBe("function");
    expect("GET" in route).toBe(false);
    expect("DELETE" in route).toBe(false);
  });
});

describe("outcome reporting", () => {
  it("reports the backend's success", async () => {
    logoutAll.mockResolvedValue(true);

    const body = await (await post("token")).json();

    expect(body).toEqual({ authenticated: false, revokedEverywhere: true });
    expect(logoutAll).toHaveBeenCalledTimes(1);
  });

  it("does not claim remote revocation when the backend refused", async () => {
    logoutAll.mockResolvedValue(false);

    const body = await (await post("token")).json();

    // The dangerous failure would be reporting success here: somebody would
    // believe a stolen session was closed.
    expect(body.revokedEverywhere).toBe(false);
    expect(body.authenticated).toBe(false);
  });

  it("reports honestly when there was no token to revoke with", async () => {
    const body = await (await post(undefined)).json();

    expect(logoutAll).not.toHaveBeenCalled();
    expect(body.revokedEverywhere).toBe(false);
  });
});

describe("local sign-out", () => {
  it.each([
    ["remote success", true],
    ["remote failure", false],
  ])("clears this browser's cookies on %s", async (_label, remote) => {
    logoutAll.mockResolvedValue(remote);

    await post("token");

    // Somebody who asked to be signed out is signed out here regardless.
    expect(clearAuthCookies).toHaveBeenCalledTimes(1);
  });

  it("clears cookies even with no access token at all", async () => {
    await post(undefined);

    expect(clearAuthCookies).toHaveBeenCalledTimes(1);
  });
});

describe("what the response never contains", () => {
  it("returns no token, cookie or authorization material", async () => {
    const body = await (await post("super-secret-token-value")).json();

    const text = JSON.stringify(body).toLowerCase();
    for (const secret of ["token", "bearer", "authorization", "cookie", "super-secret"]) {
      expect(text).not.toContain(secret);
    }
    // Only the two documented fields.
    expect(Object.keys(body).sort()).toEqual(["authenticated", "revokedEverywhere"]);
  });

  it("issues exactly one backend call and never retries", async () => {
    logoutAll.mockResolvedValue(false);

    await post("token");

    expect(logoutAll).toHaveBeenCalledTimes(1);
  });
});
