import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What each Organization screen is given.
 *
 * The landing asks two unrelated questions of two unrelated endpoints, so one
 * failing must not blank the other. And a missing invite is an ordinary state
 * with an obvious next step — not an error to apologise for.
 */

const getDepartments = vi.fn();
const getDepartment = vi.fn();
const getOrganizationMembers = vi.fn();
const getOrganizationInvite = vi.fn();

vi.mock("./organizationDataSources", () => ({
  getDepartments,
  getDepartment,
  getOrganizationMembers,
  getOrganizationInvite,
}));

const { loadOrganizationOverview, loadInviteState, loadDepartmentDetail } = await import(
  "./loadOrganization"
);

const PLATFORM = "3e38e3cc-140c-4b89-a51d-a184c6e85700";

function department(departmentId: string, name: string, manager: unknown = null) {
  return {
    departmentId,
    name,
    manager,
    memberCount: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  };
}

const INVITE = {
  inviteId: "686fcfea-14c7-493f-9c7a-2aa31267723a",
  inviteUrl: "http://localhost:5173/invite?token=example",
  active: true,
  createdAt: "2026-08-11T13:02:36Z",
  expiresAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  getDepartments.mockResolvedValue({ ok: true, value: [department(PLATFORM, "Platform")] });
  getDepartment.mockResolvedValue({ ok: true, value: department(PLATFORM, "Platform") });
  getOrganizationMembers.mockResolvedValue({ ok: true, value: [] });
  getOrganizationInvite.mockResolvedValue({ ok: true, value: INVITE });
});

describe("the organization landing", () => {
  it("keeps departments usable when the invite fails", async () => {
    getOrganizationInvite.mockResolvedValue({ ok: false, reason: "ERROR" });

    const overview = await loadOrganizationOverview();

    expect(overview.departments.ok).toBe(true);
    expect(overview.invite.kind).toBe("error");
  });

  it("keeps the invite usable when departments fail", async () => {
    getDepartments.mockResolvedValue({ ok: false, reason: "ERROR" });

    const overview = await loadOrganizationOverview();

    expect(overview.departments.ok).toBe(false);
    expect(overview.invite.kind).toBe("ready");
  });

  it("asks each endpoint once", async () => {
    await loadOrganizationOverview();

    expect(getDepartments).toHaveBeenCalledTimes(1);
    expect(getOrganizationInvite).toHaveBeenCalledTimes(1);
  });
});

describe("the invite state", () => {
  it("treats a missing invite as a state, not a failure", async () => {
    // 404 here means "none is active", which has an obvious next step.
    getOrganizationInvite.mockResolvedValue({ ok: false, reason: "NOT_FOUND" });

    expect(await loadInviteState()).toEqual({ kind: "none" });
  });

  it("keeps an outage distinct from having no invite", async () => {
    getOrganizationInvite.mockResolvedValue({ ok: false, reason: "ERROR" });

    expect(await loadInviteState()).toEqual({ kind: "error" });
  });

  it("passes the invite through unchanged", async () => {
    const state = await loadInviteState();

    expect(state).toEqual({ kind: "ready", invite: INVITE });
  });
});

describe("the department detail", () => {
  it("gives one answer for missing and for not visible", async () => {
    for (const reason of ["NOT_FOUND", "FORBIDDEN"]) {
      getDepartment.mockResolvedValue({ ok: false, reason });

      expect(await loadDepartmentDetail(PLATFORM)).toEqual({ kind: "unavailable" });
    }
  });

  it("keeps a server outage distinct from that", async () => {
    getDepartment.mockResolvedValue({ ok: false, reason: "ERROR" });

    expect(await loadDepartmentDetail(PLATFORM)).toEqual({ kind: "error" });
  });

  it("builds the manager choices from both lists", async () => {
    getOrganizationMembers.mockResolvedValue({
      ok: true,
      value: [
        { userId: "u-ana", name: "Ana", email: "ana@potriv.test", roles: ["DEPARTMENT_MANAGER"] },
        { userId: "u-bob", name: "Bob", email: "bob@potriv.test", roles: ["EMPLOYEE"] },
      ],
    });

    const state = await loadDepartmentDetail(PLATFORM);

    expect(state.kind).toBe("ready");
    if (state.kind !== "ready") return;
    expect(state.detail.managers?.choices.map((choice) => choice.userId)).toEqual(["u-ana"]);
  });

  it("leaves the picker absent rather than empty when a list fails", async () => {
    // An empty picker would read as "nobody is eligible", which is a different
    // and much more actionable statement than "this did not load".
    getOrganizationMembers.mockResolvedValue({ ok: false, reason: "ERROR" });

    const state = await loadDepartmentDetail(PLATFORM);

    expect(state.kind).toBe("ready");
    if (state.kind !== "ready") return;
    expect(state.detail.managers).toBeNull();
    expect(state.detail.department.name).toBe("Platform");
  });

  it("does not fetch the member list to decorate the count", async () => {
    await loadDepartmentDetail(PLATFORM);

    // Only the department, the people and the department list — nothing per-row.
    expect(getDepartment).toHaveBeenCalledTimes(1);
    expect(getOrganizationMembers).toHaveBeenCalledTimes(1);
    expect(getDepartments).toHaveBeenCalledTimes(1);
  });
});
