import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_INVITE_STATE } from "../../model/organizationActionState";

/**
 * Invite rotation, from the outside.
 *
 * Rotation revokes: the backend deactivates every active invite before minting
 * the new one. So the guard is the role check, and the new link is whatever came
 * back — never assembled here, and never carried in the action state, which is a
 * place for sentences rather than credentials.
 */

const resolveProductSession = vi.fn();
const rotateOrganizationInvite = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/modules/auth/server/productSession", () => ({ resolveProductSession }));
vi.mock("../organizationDataSources", () => ({ rotateOrganizationInvite }));
vi.mock("next/cache", () => ({ revalidatePath }));

const { rotateOrganizationInviteAction } = await import("./inviteActions");

const NEW_INVITE = {
  inviteId: "686fcfea-14c7-493f-9c7a-2aa31267723a",
  inviteUrl: "http://localhost:5173/invite?token=fresh-token-value",
  active: true,
  createdAt: "2026-08-11T13:02:36.112075Z",
  expiresAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  resolveProductSession.mockResolvedValue({
    authenticated: true,
    user: { userId: "oa-1", roles: ["EMPLOYEE", "ORGANIZATION_ADMIN"] },
  });
  rotateOrganizationInvite.mockResolvedValue({ ok: true, value: NEW_INVITE });
});

describe("rotating the invite", () => {
  it("calls the rotate endpoint once", async () => {
    await rotateOrganizationInviteAction(EMPTY_INVITE_STATE);

    expect(rotateOrganizationInvite).toHaveBeenCalledTimes(1);
    expect(rotateOrganizationInvite.mock.calls[0]).toHaveLength(0);
  });

  it("says the previous link stopped working", async () => {
    const state = await rotateOrganizationInviteAction(EMPTY_INVITE_STATE);

    expect(state.done).toContain("no longer works");
    expect(state.error).toBeUndefined();
  });

  it("refreshes the invite page, the landing and Home", async () => {
    await rotateOrganizationInviteAction(EMPTY_INVITE_STATE);

    for (const path of ["/organization/invite", "/organization", "/home"]) {
      expect(revalidatePath).toHaveBeenCalledWith(path);
    }
  });

  it("keeps the new link out of the action state", async () => {
    // The page renders it from the revalidated read; an action state that
    // carried a joining credential would end up anywhere a state gets logged.
    const state = await rotateOrganizationInviteAction(EMPTY_INVITE_STATE);

    const serialized = JSON.stringify(state);
    expect(serialized).not.toContain("token");
    expect(serialized).not.toContain(NEW_INVITE.inviteUrl);
    expect(serialized).not.toContain(NEW_INVITE.inviteId);
  });
});

describe("the trust boundary", () => {
  it("refuses a session without the organization-admin role, before rotating", async () => {
    for (const roles of [["EMPLOYEE"], ["EMPLOYEE", "DEPARTMENT_MANAGER"], ["EMPLOYEE", "PROJECT_MANAGER"]]) {
      vi.clearAllMocks();
      resolveProductSession.mockResolvedValue({
        authenticated: true,
        user: { userId: "u-1", roles },
      });

      const state = await rotateOrganizationInviteAction(EMPTY_INVITE_STATE);

      expect(rotateOrganizationInvite).not.toHaveBeenCalled();
      expect(state.error).toBeDefined();
    }
  });

  it("refuses an unauthenticated caller", async () => {
    resolveProductSession.mockResolvedValue({ authenticated: false });

    await rotateOrganizationInviteAction(EMPTY_INVITE_STATE);

    expect(rotateOrganizationInvite).not.toHaveBeenCalled();
  });
});

describe("what crosses back to the browser", () => {
  const LEAKS = [
    "Bearer",
    "Authorization",
    "accessToken",
    "refreshToken",
    "localhost:8080",
    "/api/",
    "/organizations/",
    "Exception",
    "timestamp",
  ];

  it("carries no token, header, backend path or envelope on any failure", async () => {
    for (const status of [400, 401, 403, 404, 500]) {
      rotateOrganizationInvite.mockResolvedValue({ ok: false, status, detail: null });

      const serialized = JSON.stringify(await rotateOrganizationInviteAction(EMPTY_INVITE_STATE));
      for (const leak of LEAKS) expect(serialized).not.toContain(leak);
    }
  });
});
