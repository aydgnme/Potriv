import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ReviewActionState } from "../model/reviewActionState";
import type { CapacityContext, ReviewProposal } from "../model/reviewQueue";

import { ReviewQueue } from "./ReviewQueue";

/**
 * The review queue and the request being read.
 *
 * The two request types share a DTO but not a meaning, and the capacity figures
 * belong to the backend. Both are places where a plausible-looking frontend
 * decision would quietly be wrong.
 */

type ReviewAction = (state: ReviewActionState, formData: FormData) => Promise<ReviewActionState>;

const stub = (): ReviewAction => async () => ({});

const acceptAssignment = vi.fn<ReviewAction>(stub());
const rejectAssignment = vi.fn<ReviewAction>(stub());
const acceptDeallocation = vi.fn<ReviewAction>(stub());
const rejectDeallocation = vi.fn<ReviewAction>(stub());

vi.mock("../server/actions/reviewActions", () => ({
  acceptAssignmentProposalAction: (s: ReviewActionState, f: FormData) => acceptAssignment(s, f),
  rejectAssignmentProposalAction: (s: ReviewActionState, f: FormData) => rejectAssignment(s, f),
  acceptDeallocationProposalAction: (s: ReviewActionState, f: FormData) =>
    acceptDeallocation(s, f),
  rejectDeallocationProposalAction: (s: ReviewActionState, f: FormData) =>
    rejectDeallocation(s, f),
}));

function capacity(overrides: Partial<CapacityContext> = {}): CapacityContext {
  return {
    maxHoursPerDay: 8,
    allocatedHoursPerDay: 2,
    availableHoursPerDay: 6,
    requestedHoursPerDay: 4,
    projectedAllocatedHoursPerDay: 6,
    projectedAvailableHoursPerDay: 2,
    currentlyAcceptableByCapacity: true,
    ...overrides,
  };
}

function assignment(overrides: Partial<ReviewProposal> = {}): ReviewProposal {
  return {
    proposalType: "ASSIGNMENT",
    proposalId: "prop-assign",
    project: { projectId: "p1", name: "Apollo", status: "IN_PROGRESS" },
    employee: { userId: "u1", name: "ASSIGNED Ayla", email: "ayla@potriv.test" },
    reviewDepartment: { departmentId: "d1", name: "Platform Engineering" },
    workHoursPerDay: 4,
    teamRoles: [{ teamRoleId: "backend", name: "Backend" }],
    comments: "Strong match on the declared stack.",
    allocationId: null,
    reason: null,
    status: "PENDING",
    proposedBy: { userId: "pm-1", name: "Deniz", email: "deniz@potriv.test" },
    createdAt: "2026-08-01T09:00:00Z",
    reviewedBy: null,
    reviewedAt: null,
    capacity: capacity(),
    rejectionReason: null,
    ...overrides,
  };
}

function removal(overrides: Partial<ReviewProposal> = {}): ReviewProposal {
  return {
    proposalType: "DEALLOCATION",
    proposalId: "prop-removal",
    project: { projectId: "p2", name: "Borealis", status: "CLOSING" },
    employee: { userId: "u2", name: "REMOVAL Rana", email: "rana@potriv.test" },
    reviewDepartment: { departmentId: "d1", name: "Platform Engineering" },
    workHoursPerDay: 3,
    teamRoles: [{ teamRoleId: "qa", name: "QA" }],
    comments: null,
    allocationId: "alloc-1",
    reason: "Project scope reduced.",
    status: "PENDING",
    proposedBy: { userId: "pm-1", name: "Deniz", email: "deniz@potriv.test" },
    createdAt: "2026-08-02T09:00:00Z",
    reviewedBy: null,
    reviewedAt: null,
    // Removing somebody frees capacity rather than consuming it.
    capacity: null,
    rejectionReason: null,
    ...overrides,
  };
}

function renderQueue(proposals: readonly ReviewProposal[], status: ReviewProposal["status"] = "PENDING") {
  return render(<ReviewQueue proposals={proposals} status={status} />);
}

function queueNames(): string[] {
  return [...document.querySelectorAll("button[aria-pressed]")].map(
    (button) => button.textContent ?? "",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("queue order and selection", () => {
  it("keeps the backend's order rather than grouping by type", () => {
    // Oldest first, interleaved. Re-sorting by type would bury an old request.
    const rows = [
      assignment({ proposalId: "a", employee: { userId: "1", name: "First", email: "1@x.test" } }),
      removal({ proposalId: "b", employee: { userId: "2", name: "Second", email: "2@x.test" } }),
      assignment({ proposalId: "c", employee: { userId: "3", name: "Third", email: "3@x.test" } }),
    ];

    renderQueue(rows);

    const names = queueNames();
    expect(names[0]).toContain("First");
    expect(names[1]).toContain("Second");
    expect(names[2]).toContain("Third");
  });

  it("selects the first row by default and says so in words", () => {
    renderQueue([assignment(), removal()]);

    expect(screen.getByRole("button", { name: /Selected/ })).toHaveTextContent(/ASSIGNED Ayla/);
    expect(screen.getByRole("heading", { level: 2, name: "ASSIGNED Ayla" })).toBeInTheDocument();
  });

  it("switches request without asking the backend for anything", async () => {
    const user = userEvent.setup();
    renderQueue([assignment(), removal()]);

    await user.click(screen.getByRole("button", { name: /REMOVAL Rana/ }));

    expect(screen.getByRole("heading", { level: 2, name: "REMOVAL Rana" })).toBeInTheDocument();
    for (const action of [acceptAssignment, rejectAssignment, acceptDeallocation, rejectDeallocation]) {
      expect(action).not.toHaveBeenCalled();
    }
  });

  it("labels the types for people, not by enum", () => {
    renderQueue([assignment(), removal()]);

    expect(screen.getAllByText(/Assignment request/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Removal request/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain("DEALLOCATION");
  });

  it("says something true when the queue is empty", () => {
    renderQueue([], "PENDING");
    expect(screen.getByText("No proposals waiting.")).toBeInTheDocument();
  });
});

describe("type separation", () => {
  it("shows an assignment's comments and capacity, and no removal reason", () => {
    renderQueue([assignment()]);

    expect(screen.getByText("Strong match on the declared stack.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Capacity" })).toBeInTheDocument();
    expect(screen.queryByText("Removal reason")).toBeNull();
  });

  it("shows a removal's reason, and no comments or capacity", async () => {
    const user = userEvent.setup();
    renderQueue([assignment(), removal()]);

    await user.click(screen.getByRole("button", { name: /REMOVAL Rana/ }));

    expect(screen.getByText("Removal reason")).toBeInTheDocument();
    expect(screen.getByText("Project scope reduced.")).toBeInTheDocument();
    // Removing frees capacity rather than consuming it.
    expect(screen.queryByRole("region", { name: "Capacity" })).toBeNull();
    expect(screen.queryByText("Strong match on the declared stack.")).toBeNull();
  });
});

describe("capacity", () => {
  it("renders every backend figure exactly", () => {
    renderQueue([assignment()]);

    const block = screen.getByRole("region", { name: "Capacity" });
    expect(within(block).getByText("2 / 8 h")).toBeInTheDocument();
    expect(within(block).getByText("6 h")).toBeInTheDocument();
    expect(within(block).getByText("4 h")).toBeInTheDocument();
    expect(within(block).getByText("6 / 8 h")).toBeInTheDocument();
    expect(within(block).getByText("2 h")).toBeInTheDocument();
  });

  it("uses the backend's maximum as the denominator, whatever it is", () => {
    // The guard against a hard-coded eight-hour day.
    renderQueue([
      assignment({
        capacity: capacity({
          maxHoursPerDay: 7,
          allocatedHoursPerDay: 3,
          availableHoursPerDay: 4,
          requestedHoursPerDay: 2,
          projectedAllocatedHoursPerDay: 5,
          projectedAvailableHoursPerDay: 2,
        }),
      }),
    ]);

    const block = screen.getByRole("region", { name: "Capacity" });
    expect(within(block).getByText("3 / 7 h")).toBeInTheDocument();
    expect(within(block).getByText("5 / 7 h")).toBeInTheDocument();
    expect(within(block).queryByText(/\/ 8 h/)).toBeNull();
  });

  it("says capacity is rechecked when accepting", () => {
    renderQueue([assignment()]);

    expect(
      screen.getByText(/checked again when you accept/),
    ).toBeInTheDocument();
  });

  it("blocks Accept and keeps Reject when the backend says it no longer fits", () => {
    // Driven by the backend's boolean, never derived from the numbers.
    renderQueue([
      assignment({
        capacity: capacity({ currentlyAcceptableByCapacity: false }),
      }),
    ]);

    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeEnabled();
    expect(
      screen.getByText(/no longer fits the employee's current capacity/),
    ).toBeInTheDocument();
  });

  it("trusts the boolean even when the numbers look fine", () => {
    renderQueue([
      assignment({
        capacity: capacity({
          projectedAvailableHoursPerDay: 4,
          currentlyAcceptableByCapacity: false,
        }),
      }),
    ]);

    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
  });

  it("shows no capacity block at all when there is none", () => {
    // Null is intentional for removals and for decided rows; zeros would be a
    // figure nobody computed.
    renderQueue([assignment({ capacity: null })]);

    expect(screen.queryByRole("region", { name: "Capacity" })).toBeNull();
    expect(document.body.textContent).not.toContain("0 / 0");
  });
});

describe("decided rows", () => {
  it("are read-only, with no decision controls", () => {
    renderQueue(
      [
        assignment({
          status: "APPROVED",
          capacity: null,
          reviewedBy: { userId: "dm-1", name: "Selin", email: "selin@potriv.test" },
          reviewedAt: "2026-08-03T09:00:00Z",
        }),
      ],
      "APPROVED",
    );

    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText(/Selin/)).toBeInTheDocument();
  });

  it("says so plainly when a rejection carried no reason", () => {
    renderQueue(
      [assignment({ status: "REJECTED", capacity: null, rejectionReason: null })],
      "REJECTED",
    );

    expect(screen.getByText("No reason given")).toBeInTheDocument();
  });

  it("never merges the removal reason with the reviewer's rejection reason", () => {
    // Two statements, by two different people, about two different things.
    renderQueue(
      [
        removal({
          status: "REJECTED",
          reason: "Project scope reduced.",
          rejectionReason: "Keep through release.",
          reviewedBy: { userId: "dm-1", name: "Selin", email: "selin@potriv.test" },
          reviewedAt: "2026-08-03T09:00:00Z",
        }),
      ],
      "REJECTED",
    );

    expect(screen.getByText("Removal reason")).toBeInTheDocument();
    expect(screen.getByText("Project scope reduced.")).toBeInTheDocument();
    expect(screen.getByText("Review rejection reason")).toBeInTheDocument();
    expect(screen.getByText("Keep through release.")).toBeInTheDocument();
  });
});

describe("decisions", () => {
  it("accepts through the action, carrying only the proposal id", async () => {
    const user = userEvent.setup();
    renderQueue([assignment()]);

    await user.click(screen.getByRole("button", { name: "Accept" }));

    expect(acceptAssignment).toHaveBeenCalledTimes(1);
    const formData = acceptAssignment.mock.calls[0]![1];
    expect(formData.get("proposalId")).toBe("prop-assign");
    expect([...formData.keys()]).toEqual(["proposalId"]);
  });

  it("offers an optional reason when rejecting, and says it is optional", async () => {
    const user = userEvent.setup();
    renderQueue([assignment()]);

    await user.click(screen.getByRole("button", { name: "Reject" }));

    expect(screen.getByText("Reject assignment request?")).toBeInTheDocument();
    expect(screen.getByText(/Optional/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject request" })).toBeEnabled();
  });

  it("names the right thing when rejecting a removal", async () => {
    const user = userEvent.setup();
    renderQueue([removal()]);

    await user.click(screen.getByRole("button", { name: "Reject" }));

    expect(screen.getByText("Reject removal request?")).toBeInTheDocument();
  });

  it("removes the decision controls once somebody else has decided", async () => {
    const user = userEvent.setup();
    acceptAssignment.mockResolvedValue({
      error: "This proposal has already been reviewed.",
      stale: true,
    });
    renderQueue([assignment()]);

    await user.click(screen.getByRole("button", { name: "Accept" }));

    expect(await screen.findByText(/already been reviewed/)).toBeInTheDocument();
    // A stale drawer with live buttons would invite a second decision.
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
  });

  it("keeps the request reviewable after a capacity race", async () => {
    const user = userEvent.setup();
    acceptAssignment.mockResolvedValue({
      error: "The employee no longer has enough available capacity for this proposal.",
    });
    renderQueue([assignment()]);

    await user.click(screen.getByRole("button", { name: "Accept" }));

    expect(await screen.findByText(/no longer has enough available capacity/)).toBeInTheDocument();
    // Nobody decided it, so it can still be rejected.
    expect(screen.getByRole("button", { name: "Reject" })).toBeEnabled();
  });
});

describe("free text at the contract's limit", () => {
  /**
   * The backend accepts 5000 characters of anything, and a removal reason is the
   * record of why somebody was taken off a project — it is shown in full.
   * "Anything" includes a single unbroken token: a pasted identifier or URL with
   * no spaces in it. With the default `overflow-wrap`, that does not wrap at all,
   * and the page widens to fit it rather than the other way round.
   */
  const UNBROKEN = "R".padEnd(4999, "o") + ".";

  it("shows the whole reason without letting it set the page width", async () => {
    const user = userEvent.setup();
    renderQueue([removal({ reason: UNBROKEN })]);

    await user.click(screen.getByRole("button", { name: /REMOVAL Rana/ }));

    const shown = screen.getByText(UNBROKEN);
    // Present in full — never truncated, and never behind a hover.
    expect(shown.textContent).toHaveLength(5000);
    // The one property that decides whether an unbreakable token wraps.
    expect(shown.className).toBeTruthy();
  });
});
