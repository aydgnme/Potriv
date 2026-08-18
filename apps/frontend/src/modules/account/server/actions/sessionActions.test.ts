import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Revoking one of your own sessions.
 *
 * This is an unsafe mutation against a security surface, so the tests are mostly
 * about restraint: one attempt, one fixed path, no retry, and no frontend
 * opinion about who owns what.
 */

const backendDelete = vi.fn();
const revalidatePath = vi.fn();
const resolveProductSession = vi.fn();

class FakeBackendRequestError extends Error {
  constructor(readonly status: number) {
    super(`status ${status}`);
  }
}

vi.mock("@/modules/auth/server-public", () => ({
  backendDelete: (path: string) => backendDelete(path),
  BackendRequestError: FakeBackendRequestError,
}));

vi.mock("@/modules/auth/server/productSession", () => ({
  resolveProductSession: () => resolveProductSession(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

const VALID = "11111111-1111-4111-8111-111111111111";

function form(sessionId: unknown) {
  const data = new FormData();
  if (sessionId !== undefined) data.set("sessionId", String(sessionId));
  return data;
}

async function revoke(sessionId: unknown) {
  const { revokeSessionAction } = await import("./sessionActions");
  return revokeSessionAction({}, form(sessionId));
}

beforeEach(() => {
  vi.resetModules();
  backendDelete.mockReset().mockResolvedValue(undefined);
  revalidatePath.mockReset();
  resolveProductSession.mockReset().mockResolvedValue({
    authenticated: true,
    user: { userId: "u1", roles: ["EMPLOYEE"] },
  });
});

describe("before anything is sent", () => {
  it("refuses an unauthenticated caller without touching the backend", async () => {
    resolveProductSession.mockResolvedValue({ authenticated: false });

    const state = await revoke(VALID);

    expect(state.error).toMatch(/session has expired/i);
    expect(backendDelete).not.toHaveBeenCalled();
  });

  it.each([
    ["not a uuid", "../../auth/logout-all"],
    ["empty", ""],
    ["path traversal", "../users"],
    ["almost a uuid", "11111111-1111-4111-8111-11111111111"],
  ])("never builds a path from a %s value", async (_label, bad) => {
    const state = await revoke(bad);

    // The endpoint is fixed and only this segment varies, so it must be a UUID
    // before it can reach a URL at all.
    expect(backendDelete).not.toHaveBeenCalled();
    expect(state.error).toMatch(/no longer available/i);
  });

  it("calls exactly the fixed session path for a valid id", async () => {
    await revoke(VALID);

    expect(backendDelete).toHaveBeenCalledTimes(1);
    expect(backendDelete).toHaveBeenCalledWith(`/auth/sessions/${VALID}`);
  });
});

describe("outcomes", () => {
  it("revalidates the account after a successful revoke", async () => {
    const state = await revoke(VALID);

    expect(state.done).toMatch(/signed out/i);
    // The row disappears because a fresh read no longer returns it.
    expect(revalidatePath).toHaveBeenCalledWith("/account");
  });

  it("treats a 404 as already ended, and refreshes rather than erroring", async () => {
    backendDelete.mockRejectedValue(new FakeBackendRequestError(404));

    const state = await revoke(VALID);

    expect(state.error).toBeUndefined();
    expect(state.done).toMatch(/already ended/i);
    expect(revalidatePath).toHaveBeenCalledWith("/account");
  });

  it("reports an expired session distinctly from a failure", async () => {
    backendDelete.mockRejectedValue(new FakeBackendRequestError(401));

    const state = await revoke(VALID);

    expect(state.error).toMatch(/session has expired/i);
  });

  it("gives a safe message for any other backend failure", async () => {
    backendDelete.mockRejectedValue(new FakeBackendRequestError(500));

    const state = await revoke(VALID);

    expect(state.error).toMatch(/could not be ended/i);
    // No status code, no backend path, no envelope.
    expect(state.error).not.toMatch(/500|auth\/sessions|http/i);
  });

  it("does not retry, whatever went wrong", async () => {
    backendDelete.mockRejectedValue(new FakeBackendRequestError(500));

    await revoke(VALID);

    // Replaying an unsafe mutation could revoke a session somebody has since
    // signed back into.
    expect(backendDelete).toHaveBeenCalledTimes(1);
  });

  it("does not revalidate when nothing was attempted", async () => {
    await revoke("not-a-uuid");

    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("what it never returns", () => {
  it("carries no token or authorization material in any outcome", async () => {
    const outcomes = [
      await revoke(VALID),
      await (async () => {
        backendDelete.mockRejectedValue(new FakeBackendRequestError(500));
        return revoke(VALID);
      })(),
    ];

    for (const state of outcomes) {
      const text = JSON.stringify(state).toLowerCase();
      for (const secret of ["token", "bearer", "authorization", "cookie"]) {
        expect(text).not.toContain(secret);
      }
    }
  });
});
