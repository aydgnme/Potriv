import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_REMOVAL_STATE } from "../../model/reviewActionState";

/**
 * A project manager asking for someone to come off a project.
 *
 * Nothing the form sends is authority. Ownership comes from re-reading the
 * project, and the allocation from re-reading the current team — an id that is
 * not active right now, because it never was or because it has already ended, is
 * refused before the backend is asked.
 */

const resolveProductSession = vi.fn();
const getProjectContext = vi.fn();
const getProjectTeamMembers = vi.fn();
const proposeDeallocation = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/modules/auth/server/productSession", () => ({ resolveProductSession }));
vi.mock("../staffingDataSources", () => ({
  getProjectContext,
  getProjectTeamMembers,
  proposeDeallocation,
}));
vi.mock("next/cache", () => ({ revalidatePath }));

const { proposeDeallocationAction } = await import("./removalActions");

const PROJECT_ID = "0f7d1c62-4b0e-4a6f-9d2a-7c1b8e5f3a10";
const ACTIVE_ALLOCATION = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const PAST_ALLOCATION = "9f8e7d6c-5b4a-4392-8172-6a5b4c3d2e1f";
const OWNER_ID = "3a1f0b44-1111-4222-8333-444455556666";

function form(fields: Record<string, string> = {}): FormData {
  const data = new FormData();
  data.set("projectId", PROJECT_ID);
  data.set("allocationId", ACTIVE_ALLOCATION);
  data.set("reason", "Scope reduced after the replan.");
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveProductSession.mockResolvedValue({
    authenticated: true,
    user: { userId: OWNER_ID, roles: ["EMPLOYEE", "PROJECT_MANAGER"] },
  });
  getProjectContext.mockResolvedValue({
    ok: true,
    value: { projectManager: { userId: OWNER_ID, name: "Deniz", email: "d@potriv.test" } },
  });
  getProjectTeamMembers.mockResolvedValue({
    ok: true,
    value: { activeMembers: [{ allocationId: ACTIVE_ALLOCATION }] },
  });
  proposeDeallocation.mockResolvedValue({
    ok: true,
    value: {
      proposalId: "prop-1",
      reviewDepartment: { departmentId: "d1", name: "Platform Engineering" },
      status: "PENDING",
    },
  });
});

describe("success", () => {
  it("sends only the reason, to the allocation's own path", async () => {
    await proposeDeallocationAction(EMPTY_REMOVAL_STATE, form());

    expect(proposeDeallocation).toHaveBeenCalledWith(
      PROJECT_ID,
      ACTIVE_ALLOCATION,
      "Scope reduced after the replan.",
    );
  });

  it("names the reviewing department from the backend's response", async () => {
    const state = await proposeDeallocationAction(EMPTY_REMOVAL_STATE, form());

    expect(state.sentTo).toBe("Platform Engineering");
  });

  it("never claims the person was removed", async () => {
    // They stay on the project until a department manager accepts.
    const state = await proposeDeallocationAction(EMPTY_REMOVAL_STATE, form());

    const serialized = JSON.stringify(state);
    for (const forbidden of ["removed", "Allocation ended", "no longer on"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("refreshes the team page and the reviewing queue", async () => {
    await proposeDeallocationAction(EMPTY_REMOVAL_STATE, form());

    expect(revalidatePath).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/team`);
    expect(revalidatePath).toHaveBeenCalledWith("/staffing");
  });
});

describe("the trust boundary", () => {
  async function expectRejected(formData: FormData) {
    const state = await proposeDeallocationAction(EMPTY_REMOVAL_STATE, formData);
    expect(proposeDeallocation).not.toHaveBeenCalled();
    return state;
  }

  it("refuses a session without the project-manager role, before reading anything", async () => {
    resolveProductSession.mockResolvedValue({
      authenticated: true,
      user: { userId: OWNER_ID, roles: ["EMPLOYEE", "DEPARTMENT_MANAGER"] },
    });

    await expectRejected(form());
    expect(getProjectContext).not.toHaveBeenCalled();
  });

  it("refuses a project manager who does not own this project", async () => {
    resolveProductSession.mockResolvedValue({
      authenticated: true,
      user: { userId: "someone-else", roles: ["EMPLOYEE", "PROJECT_MANAGER"] },
    });

    const state = await expectRejected(form());
    // The anti-leak sentence: a refusal must not confirm the project is real.
    expect(state.formError).toBe("This project does not exist or is not visible to you.");
  });

  it("refuses anything that is not an identifier", async () => {
    for (const projectId of ["", "../projects", "not-a-uuid"]) {
      await expectRejected(form({ projectId }));
    }
    for (const allocationId of ["", "../allocations", "not-a-uuid"]) {
      await expectRejected(form({ allocationId }));
    }
  });

  it("requires a reason", async () => {
    for (const reason of ["", "   ", "\n\t "]) {
      const state = await expectRejected(form({ reason }));
      expect(state.fieldErrors.reason).toBeDefined();
    }
  });

  it("accepts one character and exactly 5000, and refuses more", async () => {
    await proposeDeallocationAction(EMPTY_REMOVAL_STATE, form({ reason: "x" }));
    expect(proposeDeallocation).toHaveBeenCalledTimes(1);

    proposeDeallocation.mockClear();
    await proposeDeallocationAction(EMPTY_REMOVAL_STATE, form({ reason: "x".repeat(5000) }));
    expect(proposeDeallocation).toHaveBeenCalledTimes(1);

    proposeDeallocation.mockClear();
    const state = await expectRejected(form({ reason: "x".repeat(5001) }));
    expect(state.fieldErrors.reason).toContain("5000");
  });

  it("refuses an allocation that is not on the current active team", async () => {
    // Already ended, or never on this project at all — the team is re-read
    // rather than taken from the form.
    const state = await expectRejected(form({ allocationId: PAST_ALLOCATION }));

    expect(state.formError).toContain("no longer active");
  });

  it("checks the team as it is now, not as the page had it", async () => {
    getProjectTeamMembers.mockResolvedValue({ ok: true, value: { activeMembers: [] } });

    await expectRejected(form());
  });
});

describe("conflicts", () => {
  it("keeps the form and shows the backend's own sentence", async () => {
    proposeDeallocation.mockResolvedValue({
      ok: false,
      status: 409,
      detail: "A pending deallocation proposal already exists for this allocation.",
    });

    const state = await proposeDeallocationAction(EMPTY_REMOVAL_STATE, form());

    expect(state.formError).toContain("already exists");
    expect(state.sentTo).toBeUndefined();
  });

  it("falls back to its own sentence when the backend offers none", async () => {
    proposeDeallocation.mockResolvedValue({ ok: false, status: 409, detail: null });

    const state = await proposeDeallocationAction(EMPTY_REMOVAL_STATE, form());

    expect(state.formError).toBe("This removal could not be requested as things stand.");
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
    "/allocations/",
    "Exception",
    "timestamp",
  ];

  it("carries no token, header, backend path or envelope on any failure", async () => {
    for (const status of [400, 401, 403, 404, 409, 500]) {
      proposeDeallocation.mockResolvedValue({ ok: false, status, detail: null });

      const serialized = JSON.stringify(
        await proposeDeallocationAction(EMPTY_REMOVAL_STATE, form()),
      );
      for (const leak of LEAKS) expect(serialized).not.toContain(leak);
    }
  });
});
