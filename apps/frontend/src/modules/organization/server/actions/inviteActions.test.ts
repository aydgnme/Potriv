import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_INVITE_STATE } from "../../model/organizationActionState";

/**
 * Inviting and withdrawing, from the outside.
 *
 * The property these tests exist for is negative: no credential passes through
 * this layer. The backend generates the invite token, stores only its hash, and
 * mails the link to the invited address itself — so the action sends an address
 * out and gets metadata back, and there is nothing here that could be pasted
 * into a browser to join an organization.
 *
 * The rest is the trust boundary: organization-admin only, checked before any
 * read, and an identifier narrowed to a UUID before it can reach a path.
 */

const resolveProductSession = vi.fn();
const createOrganizationInvite = vi.fn();
const revokeOrganizationInvite = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/modules/auth/server/productSession", () => ({ resolveProductSession }));
vi.mock("../organizationDataSources", () => ({
  createOrganizationInvite,
  revokeOrganizationInvite,
}));
vi.mock("next/cache", () => ({ revalidatePath }));

const { inviteEmployeeAction, revokeInviteAction } = await import("./inviteActions");

const INVITE_ID = "686fcfea-14c7-493f-9c7a-2aa31267723a";

const ISSUED = {
  inviteId: INVITE_ID,
  maskedEmail: "ad****@example.com",
  status: "PENDING",
  createdAt: "2026-08-11T13:02:36.112075Z",
  expiresAt: "2026-08-14T13:02:36.112075Z",
};

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveProductSession.mockResolvedValue({
    authenticated: true,
    user: { userId: "oa-1", roles: ["EMPLOYEE", "ORGANIZATION_ADMIN"] },
  });
  createOrganizationInvite.mockResolvedValue({ ok: true, value: ISSUED });
  revokeOrganizationInvite.mockResolvedValue({ ok: true, value: undefined });
});

describe("inviting somebody", () => {
  it("sends the trimmed address and nothing else", async () => {
    await inviteEmployeeAction(EMPTY_INVITE_STATE, form({ email: "  ada@example.com  " }));

    expect(createOrganizationInvite).toHaveBeenCalledTimes(1);
    expect(createOrganizationInvite).toHaveBeenCalledWith("ada@example.com");
  });

  it("rejects an obvious non-address without calling the backend", async () => {
    for (const bad of ["", "   ", "ada", "ada@", "@example.com", "ada example.com"]) {
      vi.clearAllMocks();

      const state = await inviteEmployeeAction(EMPTY_INVITE_STATE, form({ email: bad }));

      expect(createOrganizationInvite).not.toHaveBeenCalled();
      expect(state.fieldError).toBeDefined();
    }
  });

  it("keeps a rejected address so it can be corrected rather than retyped", async () => {
    createOrganizationInvite.mockResolvedValue({ ok: false, status: 400, detail: null });

    const state = await inviteEmployeeAction(
      EMPTY_INVITE_STATE,
      form({ email: "ada@example.com" }),
    );

    expect(state.email).toBe("ada@example.com");
    expect(state.error).toBeDefined();
  });

  it("refreshes the invitations page, the landing and Home", async () => {
    await inviteEmployeeAction(EMPTY_INVITE_STATE, form({ email: "ada@example.com" }));

    for (const path of ["/organization/invite", "/organization", "/home"]) {
      expect(revalidatePath).toHaveBeenCalledWith(path);
    }
  });

  it("carries no credential back to the browser", async () => {
    /*
      The backend cannot return a token here — but if it ever started to, this
      action must not pass it on. The stubbed response is given one, and the
      resulting state must still be free of it.
    */
    createOrganizationInvite.mockResolvedValue({
      ok: true,
      value: { ...ISSUED, inviteUrl: "https://potriv.example/invite#token=leaked-token-value" },
    });

    const serialized = JSON.stringify(
      await inviteEmployeeAction(EMPTY_INVITE_STATE, form({ email: "ada@example.com" })),
    );

    expect(serialized).not.toContain("leaked-token-value");
    expect(serialized).not.toContain("token=");
    expect(serialized).not.toContain("inviteUrl");
  });
});

describe("withdrawing an invitation", () => {
  it("calls the backend once with the identifier", async () => {
    await revokeInviteAction(EMPTY_INVITE_STATE, form({ inviteId: INVITE_ID }));

    expect(revokeOrganizationInvite).toHaveBeenCalledTimes(1);
    expect(revokeOrganizationInvite).toHaveBeenCalledWith(INVITE_ID);
  });

  it("says the link stopped working", async () => {
    const state = await revokeInviteAction(EMPTY_INVITE_STATE, form({ inviteId: INVITE_ID }));

    expect(state.done).toContain("no longer works");
    expect(state.error).toBeUndefined();
  });

  it("never lets a non-UUID reach a path", async () => {
    for (const bad of ["", "not-a-uuid", "../../admin/invitations", `${INVITE_ID}/../x`]) {
      vi.clearAllMocks();

      const state = await revokeInviteAction(EMPTY_INVITE_STATE, form({ inviteId: bad }));

      expect(revokeOrganizationInvite).not.toHaveBeenCalled();
      expect(state.error).toBeDefined();
    }
  });
});

describe("the trust boundary", () => {
  const NON_ADMIN = [["EMPLOYEE"], ["EMPLOYEE", "DEPARTMENT_MANAGER"], ["EMPLOYEE", "PROJECT_MANAGER"]];

  it("refuses a session without the organization-admin role, before any call", async () => {
    for (const roles of NON_ADMIN) {
      vi.clearAllMocks();
      resolveProductSession.mockResolvedValue({
        authenticated: true,
        user: { userId: "u-1", roles },
      });

      const invited = await inviteEmployeeAction(
        EMPTY_INVITE_STATE,
        form({ email: "ada@example.com" }),
      );
      const revoked = await revokeInviteAction(EMPTY_INVITE_STATE, form({ inviteId: INVITE_ID }));

      expect(createOrganizationInvite).not.toHaveBeenCalled();
      expect(revokeOrganizationInvite).not.toHaveBeenCalled();
      expect(invited.error).toBeDefined();
      expect(revoked.error).toBeDefined();
    }
  });

  it("refuses an unauthenticated caller", async () => {
    resolveProductSession.mockResolvedValue({ authenticated: false });

    await inviteEmployeeAction(EMPTY_INVITE_STATE, form({ email: "ada@example.com" }));
    await revokeInviteAction(EMPTY_INVITE_STATE, form({ inviteId: INVITE_ID }));

    expect(createOrganizationInvite).not.toHaveBeenCalled();
    expect(revokeOrganizationInvite).not.toHaveBeenCalled();
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
      createOrganizationInvite.mockResolvedValue({ ok: false, status, detail: null });
      revokeOrganizationInvite.mockResolvedValue({ ok: false, status, detail: null });

      for (const serialized of [
        JSON.stringify(
          await inviteEmployeeAction(EMPTY_INVITE_STATE, form({ email: "ada@example.com" })),
        ),
        JSON.stringify(
          await revokeInviteAction(EMPTY_INVITE_STATE, form({ inviteId: INVITE_ID })),
        ),
      ]) {
        for (const leak of LEAKS) expect(serialized).not.toContain(leak);
      }
    }
  });
});
