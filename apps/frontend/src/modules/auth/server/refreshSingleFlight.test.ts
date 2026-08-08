import { afterEach, describe, expect, it, vi } from "vitest";

import type { BackendResult, BackendTokenPair } from "./backendAuth";
import { refreshOnce, resetRefreshSingleFlight } from "./refreshSingleFlight";

/**
 * Rotation makes a duplicate refresh dangerous rather than merely wasteful: the
 * backend marks the old token used, and a second request presenting it trips
 * reuse detection and revokes the whole session. These tests pin the behaviour
 * that prevents that.
 *
 * Obviously fake token values, and none of them is printed.
 */

const OLD_TOKEN = "old-refresh-token-fixture";

function tokenPair(accessToken: string): BackendTokenPair {
  return {
    accessToken,
    refreshToken: "next-refresh-token-fixture",
    tokenType: "Bearer",
    expiresInSeconds: 900,
    userId: "11111111-1111-4111-8111-111111111111",
    organizationId: "22222222-2222-4222-8222-222222222222",
    name: "Mert Aydoğan",
    email: "mert@northwind.test",
    roles: ["EMPLOYEE"],
  };
}

afterEach(() => {
  resetRefreshSingleFlight();
});

describe("refreshOnce", () => {
  it("returns the rotated pair from the backend", async () => {
    const performRefresh = vi
      .fn<(token: string) => Promise<BackendResult<BackendTokenPair>>>()
      .mockResolvedValue({ ok: true, value: tokenPair("access-1") });

    const result = await refreshOnce(OLD_TOKEN, { performRefresh });

    expect(result.ok).toBe(true);
    expect(performRefresh).toHaveBeenCalledTimes(1);
  });

  it("collapses concurrent refreshes of the same token into one backend call", async () => {
    let release: (value: BackendResult<BackendTokenPair>) => void = () => {};
    const pending = new Promise<BackendResult<BackendTokenPair>>((resolve) => {
      release = resolve;
    });
    const performRefresh = vi
      .fn<(token: string) => Promise<BackendResult<BackendTokenPair>>>()
      .mockReturnValue(pending);

    const first = refreshOnce(OLD_TOKEN, { performRefresh });
    const second = refreshOnce(OLD_TOKEN, { performRefresh });
    const third = refreshOnce(OLD_TOKEN, { performRefresh });

    release({ ok: true, value: tokenPair("access-1") });
    const results = await Promise.all([first, second, third]);

    // One rotation, three satisfied callers — three would have destroyed the session.
    expect(performRefresh).toHaveBeenCalledTimes(1);
    for (const result of results) {
      expect(result).toEqual({ ok: true, value: tokenPair("access-1") });
    }
  });

  it("serves a late arrival from the grace window without refreshing again", async () => {
    const performRefresh = vi
      .fn<(token: string) => Promise<BackendResult<BackendTokenPair>>>()
      .mockResolvedValue({ ok: true, value: tokenPair("access-1") });

    await refreshOnce(OLD_TOKEN, { performRefresh, graceWindowMs: 1_000 });
    // A request already in flight when the new cookie was set still carries the
    // old token; it must reuse the result rather than rotate again.
    const late = await refreshOnce(OLD_TOKEN, { performRefresh, graceWindowMs: 1_000 });

    expect(performRefresh).toHaveBeenCalledTimes(1);
    expect(late.ok).toBe(true);
  });

  it("stops serving the cached result once the grace window closes", async () => {
    vi.useFakeTimers();
    try {
      const performRefresh = vi
        .fn<(token: string) => Promise<BackendResult<BackendTokenPair>>>()
        .mockResolvedValue({ ok: true, value: tokenPair("access-1") });

      await refreshOnce(OLD_TOKEN, { performRefresh, graceWindowMs: 50 });
      await vi.advanceTimersByTimeAsync(51);
      await refreshOnce(OLD_TOKEN, { performRefresh, graceWindowMs: 50 });

      // Bounded on purpose: this is a race window, not a token cache.
      expect(performRefresh).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not cache a failure — every caller learns the session is gone", async () => {
    const performRefresh = vi
      .fn<(token: string) => Promise<BackendResult<BackendTokenPair>>>()
      .mockResolvedValue({
        ok: false,
        error: { code: "UNAUTHENTICATED", message: "Your session has expired." },
      });

    const first = await refreshOnce(OLD_TOKEN, { performRefresh });
    expect(first.ok).toBe(false);

    await refreshOnce(OLD_TOKEN, { performRefresh });
    expect(performRefresh).toHaveBeenCalledTimes(2);
  });

  it("keeps different tokens independent", async () => {
    const performRefresh = vi
      .fn<(token: string) => Promise<BackendResult<BackendTokenPair>>>()
      .mockResolvedValue({ ok: true, value: tokenPair("access-1") });

    await Promise.all([
      refreshOnce("token-a-fixture", { performRefresh }),
      refreshOnce("token-b-fixture", { performRefresh }),
    ]);

    expect(performRefresh).toHaveBeenCalledTimes(2);
  });
});
