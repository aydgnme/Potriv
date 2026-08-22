import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { cssContract } from "@/test/cssContract";

import type { ReviewActionState } from "../model/reviewActionState";
import type { CapacityContext, ReviewProposal } from "../model/reviewQueue";

import { ReviewQueue } from "./ReviewQueue";
import styles from "./Staffing.module.css";

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
    // Pinned to the class that carries the wrapping, not to "has some class":
    // an unrelated class must not be able to keep this green.
    expect(shown).toHaveClass(styles.longText);
  });

  /**
   * The other half, which the assertion above cannot make.
   *
   * `toHaveClass` proves the element is wired to `.longText`. It says nothing
   * about what `.longText` does — delete `overflow-wrap: anywhere` from the
   * stylesheet and the test above stays green while the page widens to 41283px
   * again. jsdom applies no layout, so the behaviour itself is a browser
   * measurement; what is testable here is that the declaration carrying it is
   * still in the rule the component points at.
   */
  it("wraps because the rule it points at says so", () => {
    const longText = cssContract(
      "src/modules/staffing/components/Staffing.module.css",
    ).rule(".longText");

    // `anywhere` rather than `break-word`: the latter still refuses to break a
    // token that is alone on its line, which is exactly this case.
    expect(longText).toMatch(/overflow-wrap:\s*anywhere/);
    // And the text keeps its own line breaks — a reason typed across paragraphs
    // is not silently reflowed into one.
    expect(longText).toMatch(/white-space:\s*pre-wrap/);
  });
});

/**
 * The two reasons, which come from different people and must never merge.
 *
 * `reason` is the project manager saying why they asked to end an allocation.
 * `rejectionReason` is the department manager saying why they declined that
 * request. A rejected removal carries both at once, and collapsing them would
 * put one person's words in the other's mouth on a record of an accountable
 * decision.
 */
describe("removal reason is not the reviewer's rejection reason", () => {
  const rejected = removal({
    status: "REJECTED",
    reason: "Project scope ended.",
    rejectionReason: "Employee is still required during transition.",
    reviewedBy: { userId: "dm-1", name: "Selin", email: "selin@potriv.test" },
    reviewedAt: "2026-08-05T09:00:00Z",
  });

  it("shows both statements, each under its own heading", () => {
    renderQueue([rejected]);

    const removalHeading = screen.getByRole("heading", { name: "Removal reason" });
    const reviewHeading = screen.getByRole("heading", { name: "Review rejection reason" });

    expect(removalHeading).toBeInTheDocument();
    expect(reviewHeading).toBeInTheDocument();
    expect(screen.getByText("Project scope ended.")).toBeInTheDocument();
    expect(screen.getByText("Employee is still required during transition.")).toBeInTheDocument();
  });

  it("keeps each sentence under the heading that names its author", () => {
    renderQueue([rejected]);

    // The request section holds the proposer's words; the decision section holds
    // the reviewer's. If either leaked into the other this fails.
    const request = screen.getByRole("heading", { name: "Request" }).closest("section") as HTMLElement;
    const decision = screen.getByRole("heading", { name: "Decision" }).closest("section") as HTMLElement;

    expect(within(request).getByText("Project scope ended.")).toBeInTheDocument();
    expect(within(request).queryByText(/still required during transition/)).toBeNull();

    expect(within(decision).getByText("Employee is still required during transition.")).toBeInTheDocument();
    expect(within(decision).queryByText("Project scope ended.")).toBeNull();
  });

  it("does not present a removal reason as assignment comments", () => {
    renderQueue([rejected]);

    // "Comments" is the assignment word. A removal has a reason, and calling it
    // comments would misdescribe a required field as optional context.
    expect(screen.queryByRole("heading", { name: "Comments" })).toBeNull();
  });

  it("says no reason was given rather than borrowing the other one", () => {
    renderQueue([
      removal({
        status: "REJECTED",
        reason: "Project scope ended.",
        rejectionReason: null,
      }),
    ]);

    expect(screen.getByText("No reason given")).toBeInTheDocument();
    // The proposer's reason must not be promoted into the reviewer's slot.
    const decision = screen.getByRole("heading", { name: "Decision" }).closest("section") as HTMLElement;
    expect(within(decision).queryByText("Project scope ended.")).toBeNull();
  });
});

/**
 * Capacity belongs to the backend.
 *
 * `currentlyAcceptableByCapacity` is its conclusion, reached with the same rule
 * acceptance uses. Recomputing it here would be a second, quieter capacity model
 * that could disagree with the one that actually decides.
 */
describe("capacity is the backend's conclusion", () => {
  it("does not infer acceptability from the numbers", () => {
    // Deliberately contradictory: the arithmetic says it fits (2 + 4 <= 8) while
    // the backend says it does not. The backend wins.
    renderQueue([
      assignment({
        capacity: capacity({
          allocatedHoursPerDay: 2,
          requestedHoursPerDay: 4,
          projectedAllocatedHoursPerDay: 6,
          projectedAvailableHoursPerDay: 2,
          currentlyAcceptableByCapacity: false,
        }),
      }),
    ]);

    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
    expect(screen.getByText(/This no longer fits/)).toBeInTheDocument();
  });

  it("keeps Reject available so the request can still be resolved", () => {
    renderQueue([
      assignment({ capacity: capacity({ currentlyAcceptableByCapacity: false }) }),
    ]);

    // Never auto-rejected and never hidden: the backend leaves it pending on
    // purpose, and the decision stays the manager's.
    expect(screen.getByRole("button", { name: "Reject" })).toBeEnabled();
  });

  it("calls capacity a snapshot that is checked again, never a reservation", () => {
    renderQueue([assignment()]);

    expect(screen.getByText(/checked again when you accept/)).toBeInTheDocument();
    const text = document.body.textContent ?? "";
    for (const word of ["reserved", "reservation", "held for", "guaranteed"]) {
      expect(text.toLowerCase()).not.toContain(word);
    }
  });

  it("shows no capacity block at all when the backend sent none", () => {
    // Null is not zero. A removal frees hours, so there is nothing to check —
    // and "0 / 8" would be a figure nobody computed.
    renderQueue([removal()]);

    expect(screen.queryByRole("heading", { name: "Capacity" })).toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/0\s*\/\s*8/);
  });
});

/**
 * Selecting a different request, exercised where React actually runs.
 *
 * These assertions are the reason the browser snapshot is not the authority on
 * interaction: a server-rendered page proves markup and CSS, not behaviour.
 */
describe("selection switches the detail without touching the backend", () => {
  it("moves from a rejected assignment to a rejected removal and swaps the reasons", async () => {
    const user = userEvent.setup();
    const rejectedAssignment = assignment({
      status: "REJECTED",
      comments: "Requested for the migration workstream.",
      rejectionReason: "Capacity was committed elsewhere.",
      capacity: null,
    });
    const rejectedRemoval = removal({
      status: "REJECTED",
      reason: "Project scope ended.",
      rejectionReason: "Employee is still required during transition.",
      capacity: null,
    });

    renderQueue([rejectedAssignment, rejectedRemoval], "REJECTED");

    // Default selection is the first backend row — the assignment.
    expect(screen.getByRole("heading", { name: "Comments" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Removal reason" })).toBeNull();

    await user.click(screen.getByRole("button", { name: /REMOVAL Rana/ }));

    // The removal's own pair, and none of the assignment's text left behind.
    expect(screen.getByRole("heading", { name: "Removal reason" })).toBeInTheDocument();
    expect(screen.getByText("Project scope ended.")).toBeInTheDocument();
    expect(screen.getByText("Employee is still required during transition.")).toBeInTheDocument();
    expect(screen.queryByText("Requested for the migration workstream.")).toBeNull();
    expect(screen.queryByText("Capacity was committed elsewhere.")).toBeNull();

    for (const action of [acceptAssignment, rejectAssignment, acceptDeallocation, rejectDeallocation]) {
      expect(action).not.toHaveBeenCalled();
    }
  });

  it("moves selection state with the pressed control", async () => {
    const user = userEvent.setup();
    renderQueue([assignment(), removal()]);

    const [first, second] = screen.getAllByRole("button", { name: /request/i });
    expect(first).toHaveAttribute("aria-pressed", "true");
    expect(second).toHaveAttribute("aria-pressed", "false");

    await user.click(second);

    expect(second).toHaveAttribute("aria-pressed", "true");
    expect(first).toHaveAttribute("aria-pressed", "false");
  });

  it("renders only the selected request's detail, never one per row", () => {
    renderQueue([assignment(), removal()]);

    // Mounting a hidden detail for every row would cost the queue its speed and
    // put a second copy of every heading in the accessibility tree.
    expect(screen.getAllByRole("heading", { name: "Request" })).toHaveLength(1);
  });
});
