import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_REVIEW_STATE } from "../../model/reviewActionState";

/**
 * A department manager's decisions, from the outside.
 *
 * The browser sends a proposal id and, for a rejection, an optional sentence.
 * Everything else — whether this person manages the reviewing department, whether
 * the proposal is still pending, whether capacity still fits — stays with the
 * backend, and every failure comes back as one sentence with nothing attached.
 */

const resolveProductSession = vi.fn();
const acceptAssignment = vi.fn();
const rejectAssignment = vi.fn();
const acceptDeallocation = vi.fn();
const rejectDeallocation = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/modules/auth/server/productSession", () => ({ resolveProductSession }));
vi.mock("../staffingDataSources", () => ({
  acceptAssignment,
  rejectAssignment,
  acceptDeallocation,
  rejectDeallocation,
}));
vi.mock("next/cache", () => ({ revalidatePath }));

const {
  acceptAssignmentProposalAction,
  rejectAssignmentProposalAction,
  acceptDeallocationProposalAction,
  rejectDeallocationProposalAction,
} = await import("./reviewActions");

const PROPOSAL_ID = "0f7d1c62-4b0e-4a6f-9d2a-7c1b8e5f3a10";
const PROJECT_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

function form(fields: Record<string, string> = {}): FormData {
  const data = new FormData();
  data.append("proposalId", PROPOSAL_ID);
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

function approved(deallocatedAt: string | null = null) {
  return {
    ok: true,
    value: {
      proposal: { proposalId: PROPOSAL_ID, status: "APPROVED", project: { projectId: PROJECT_ID } },
      allocation: { allocationId: "a1", deallocatedAt },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveProductSession.mockResolvedValue({
    authenticated: true,
    user: { userId: "dm-1", roles: ["EMPLOYEE", "DEPARTMENT_MANAGER"] },
  });
  acceptAssignment.mockResolvedValue(approved());
  rejectAssignment.mockResolvedValue({
    ok: true,
    value: { proposal: { proposalId: PROPOSAL_ID, status: "REJECTED", project: { projectId: PROJECT_ID } } },
  });
  acceptDeallocation.mockResolvedValue(approved("2026-08-09T17:00:00Z"));
  rejectDeallocation.mockResolvedValue({
    ok: true,
    value: { proposal: { proposalId: PROPOSAL_ID, status: "REJECTED", project: { projectId: PROJECT_ID } } },
  });
});

describe("assignment accept", () => {
  it("calls the assignment accept endpoint with no body", async () => {
    const state = await acceptAssignmentProposalAction(EMPTY_REVIEW_STATE, form());

    expect(acceptAssignment).toHaveBeenCalledWith(PROPOSAL_ID);
    expect(state.error).toBeUndefined();
    expect(state.done).toContain("Assignment approved");
  });

  it("refreshes the queue, home and the project surfaces that changed", async () => {
    await acceptAssignmentProposalAction(EMPTY_REVIEW_STATE, form());

    for (const path of [
      "/staffing",
      "/home",
      "/projects",
      `/projects/${PROJECT_ID}`,
      `/projects/${PROJECT_ID}/team`,
    ]) {
      expect(revalidatePath).toHaveBeenCalledWith(path);
    }
  });

  it("refuses a session without the department-manager role", async () => {
    resolveProductSession.mockResolvedValue({
      authenticated: true,
      user: { userId: "pm-1", roles: ["EMPLOYEE", "PROJECT_MANAGER"] },
    });

    const state = await acceptAssignmentProposalAction(EMPTY_REVIEW_STATE, form());

    expect(state.error).toBeDefined();
    expect(acceptAssignment).not.toHaveBeenCalled();
  });

  it("refuses anything that is not an identifier", async () => {
    for (const proposalId of ["", "../accept", "not-a-uuid", "1 OR 1=1"]) {
      const data = new FormData();
      data.append("proposalId", proposalId);

      await acceptAssignmentProposalAction(EMPTY_REVIEW_STATE, data);
      expect(acceptAssignment).not.toHaveBeenCalled();
    }
  });
});

describe("capacity race", () => {
  it("keeps the request reviewable and explains it in the backend's words", async () => {
    acceptAssignment.mockResolvedValue({
      ok: false,
      status: 409,
      detail: "The employee no longer has enough available capacity for this proposal.",
    });

    const state = await acceptAssignmentProposalAction(EMPTY_REVIEW_STATE, form());

    expect(state.error).toContain("no longer has enough available capacity");
    expect(state.done).toBeUndefined();
    // Not stale: nobody decided it, so the row keeps its Reject button.
    expect(state.stale).toBeFalsy();
    // Re-read anyway, because capacity has moved.
    expect(revalidatePath).toHaveBeenCalledWith("/staffing");
  });
});

describe("already reviewed", () => {
  it("marks the selection stale so a second decision cannot be offered", async () => {
    acceptAssignment.mockResolvedValue({
      ok: false,
      status: 409,
      detail: "This proposal has already been reviewed.",
    });

    const state = await acceptAssignmentProposalAction(EMPTY_REVIEW_STATE, form());

    expect(state.stale).toBe(true);
    expect(state.error).toContain("already been reviewed");
    expect(revalidatePath).toHaveBeenCalledWith("/staffing");
  });

  it("treats an ordinary conflict as not stale", async () => {
    acceptAssignment.mockResolvedValue({
      ok: false,
      status: 409,
      detail: "The employee already has an active allocation on this project.",
    });

    const state = await acceptAssignmentProposalAction(EMPTY_REVIEW_STATE, form());

    expect(state.stale).toBeFalsy();
    expect(state.error).toContain("already has an active allocation");
  });
});

describe("rejection reason", () => {
  it("is genuinely optional", async () => {
    await rejectAssignmentProposalAction(EMPTY_REVIEW_STATE, form());

    expect(rejectAssignment).toHaveBeenCalledWith(PROPOSAL_ID, null);
  });

  it("treats whitespace as no reason at all", async () => {
    await rejectAssignmentProposalAction(EMPTY_REVIEW_STATE, form({ reason: "   \n  " }));

    expect(rejectAssignment).toHaveBeenCalledWith(PROPOSAL_ID, null);
  });

  it("trims and sends a real reason", async () => {
    await rejectAssignmentProposalAction(EMPTY_REVIEW_STATE, form({ reason: "  Not this quarter.  " }));

    expect(rejectAssignment).toHaveBeenCalledWith(PROPOSAL_ID, "Not this quarter.");
  });

  it("accepts exactly 5000 characters and refuses more", async () => {
    await rejectAssignmentProposalAction(EMPTY_REVIEW_STATE, form({ reason: "x".repeat(5000) }));
    expect(rejectAssignment).toHaveBeenCalledTimes(1);

    rejectAssignment.mockClear();
    const state = await rejectAssignmentProposalAction(
      EMPTY_REVIEW_STATE,
      form({ reason: "x".repeat(5001) }),
    );

    expect(state.error).toContain("5000");
    expect(rejectAssignment).not.toHaveBeenCalled();
  });
});

describe("deallocation review", () => {
  it("accepts through the deallocation endpoint", async () => {
    const state = await acceptDeallocationProposalAction(EMPTY_REVIEW_STATE, form());

    expect(acceptDeallocation).toHaveBeenCalledWith(PROPOSAL_ID);
    expect(state.done).toContain("allocation has ended");
    expect(revalidatePath).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/team`);
  });

  it("never implies the employee left when a removal is rejected", async () => {
    const state = await rejectDeallocationProposalAction(EMPTY_REVIEW_STATE, form());

    expect(rejectDeallocation).toHaveBeenCalledWith(PROPOSAL_ID, null);
    expect(state.done).toContain("stays on the project");
    expect(state.done).not.toMatch(/removed|ended/i);
  });

  it("carries the reviewer's reason when there is one", async () => {
    await rejectDeallocationProposalAction(
      EMPTY_REVIEW_STATE,
      form({ reason: "Keep through release." }),
    );

    expect(rejectDeallocation).toHaveBeenCalledWith(PROPOSAL_ID, "Keep through release.");
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
    "/department/",
    "Exception",
    "timestamp",
  ];

  it("carries no token, header, backend path or envelope on any failure", async () => {
    for (const status of [400, 401, 403, 404, 409, 500]) {
      acceptAssignment.mockResolvedValue({ ok: false, status, detail: null });

      const serialized = JSON.stringify(
        await acceptAssignmentProposalAction(EMPTY_REVIEW_STATE, form()),
      );
      for (const leak of LEAKS) expect(serialized).not.toContain(leak);
    }
  });

  it("carries nothing but a sentence on success", async () => {
    const state = await acceptAssignmentProposalAction(EMPTY_REVIEW_STATE, form());

    expect(Object.keys(state)).toEqual(["done"]);
  });
});
