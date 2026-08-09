import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProposalState } from "../model/proposalState";
import type { Candidate, StaffingProjectContext } from "../model/teamFinderData";
import { proposableRequirements } from "../utils/openRequirements";

import { ProposeAssignmentForm } from "./ProposeAssignmentForm";

/**
 * Asking for someone.
 *
 * A proposal is a request a department manager reviews — the copy, the defaults
 * and the guards all have to reflect that this screen cannot put anyone on a
 * project by itself.
 */

const action = vi.fn(
  async (_state: ProposalState, _formData: FormData): Promise<ProposalState> => ({
    fieldErrors: {},
  }),
);

vi.mock("../server/actions/proposalActions", () => ({
  proposeAssignmentAction: (state: ProposalState, formData: FormData) => action(state, formData),
}));

const BACKEND = "role-backend";
const QA = "role-qa";
const LEGACY = "role-legacy";

function context(): Pick<StaffingProjectContext, "teamRoleRequirements" | "activeMembers"> {
  return {
    // Backend is short of two, QA is filled, Legacy is inactive.
    teamRoleRequirements: [
      {
        requirementId: "r1",
        teamRole: { teamRoleId: BACKEND, name: "Backend", active: true },
        requiredMembers: 3,
      },
      {
        requirementId: "r2",
        teamRole: { teamRoleId: QA, name: "QA", active: true },
        requiredMembers: 1,
      },
      {
        requirementId: "r3",
        teamRole: { teamRoleId: LEGACY, name: "Legacy", active: false },
        requiredMembers: 1,
      },
    ],
    activeMembers: [
      {
        allocationId: "a1",
        employee: { userId: "u9", name: "Mehmet", email: "m@potriv.test" },
        roles: [{ teamRoleId: BACKEND }, { teamRoleId: QA }],
      },
    ],
  };
}

function candidate(availableHours: number, closeToFinish = false): Candidate {
  return {
    employee: { userId: "u1", name: "Elif Demir", email: "elif@potriv.test" },
    department: { departmentId: "d1", name: "Platform Engineering" },
    availability: {
      allocatedHours: 8 - availableHours,
      availableHours,
      activeAllocationCount: 1,
      fullyAvailable: false,
      partiallyAvailable: availableHours > 0,
      unavailable: availableHours === 0,
      closeToFinish,
      closeToFinishProjects: [],
    },
    skillMatches: [],
    pastProjectMatches: [],
    score: { skillScore: 30, pastProjectScore: 0, availabilityScore: 10, totalScore: 40 },
  };
}

function renderForm(availableHours = 6, closeToFinish = false) {
  return render(
    <ProposeAssignmentForm
      projectId="p1"
      candidate={candidate(availableHours, closeToFinish)}
      openings={proposableRequirements(context())}
    />,
  );
}

beforeEach(() => {
  action.mockClear();
  action.mockResolvedValue({ fieldErrors: {} });
});

describe("what the action is called", () => {
  it("proposes rather than assigns", () => {
    renderForm();

    expect(
      screen.getByRole("button", { name: "Propose for this project" }),
    ).toBeInTheDocument();
    const text = document.body.textContent ?? "";
    for (const forbidden of ["Assign", "Add to team", "Hire"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("says a department manager decides", () => {
    renderForm();

    expect(
      screen.getByText("A department manager reviews this before anyone joins the project."),
    ).toBeInTheDocument();
  });
});

describe("role prefill", () => {
  it("offers only active roles that still want people, and preselects them", () => {
    renderForm();

    const backend = screen.getByRole("checkbox", { name: /Backend/ });
    expect(backend).toBeChecked();

    // Filled, so not offered at all.
    expect(screen.queryByRole("checkbox", { name: /QA/ })).toBeNull();
    // Inactive, so the backend would refuse it.
    expect(screen.queryByRole("checkbox", { name: /Legacy/ })).toBeNull();
  });

  it("says how many people each offered role still needs", () => {
    renderForm();

    expect(screen.getByText(/2 still needed/)).toBeInTheDocument();
  });

  it("lets a role be unticked, but not the last one", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("checkbox", { name: /Backend/ }));

    expect(screen.getByRole("checkbox", { name: /Backend/ })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Propose for this project" })).toBeDisabled();
  });

  it("points at project settings when nothing is open", () => {
    render(
      <ProposeAssignmentForm projectId="p1" candidate={candidate(6)} openings={[]} />,
    );

    expect(screen.getByText(/Every active role requirement/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Project settings" })).toHaveAttribute(
      "href",
      "/projects/p1/edit",
    );
    expect(screen.queryByRole("button", { name: "Propose for this project" })).toBeNull();
  });
});

describe("hours guard", () => {
  it("accepts whole hours from one up to what the candidate has", async () => {
    const user = userEvent.setup();
    renderForm(3);

    const hours = screen.getByLabelText(/Hours per day/);
    const submit = screen.getByRole("button", { name: "Propose for this project" });

    for (const value of ["1", "3"]) {
      await user.clear(hours);
      await user.type(hours, value);
      expect(submit).toBeEnabled();
    }
  });

  it("refuses zero and more than the candidate has", async () => {
    const user = userEvent.setup();
    renderForm(3);

    const hours = screen.getByLabelText(/Hours per day/);
    const submit = screen.getByRole("button", { name: "Propose for this project" });

    for (const value of ["0", "4"]) {
      await user.clear(hours);
      await user.type(hours, value);
      expect(submit).toBeDisabled();
    }
  });

  it("reports the hours the backend gave, without inventing a working day", () => {
    renderForm(6);

    expect(screen.getByText("6 h available today.")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("of 8");
  });

  it("lets a candidate with no hours be inspected but not proposed", () => {
    // Finishing other work soon is evidence about later, not capacity now.
    renderForm(0, true);

    expect(screen.getByText(/no available hours right now/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Propose for this project" })).toBeDisabled();
  });
});

describe("outcomes", () => {
  it("names the reviewing department the backend chose", async () => {
    const user = userEvent.setup();
    action.mockResolvedValue({ fieldErrors: {}, sentTo: "Platform Engineering" });
    renderForm();

    await user.click(screen.getByRole("button", { name: "Propose for this project" }));

    expect(
      await screen.findByText("Proposal sent to Platform Engineering for review."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View project team" })).toHaveAttribute(
      "href",
      "/projects/p1/team",
    );
  });

  it("keeps the form and the reason when capacity changed underneath", async () => {
    // The finder's figure was a snapshot; the backend is the authority.
    const user = userEvent.setup();
    action.mockResolvedValue({
      fieldErrors: {},
      formError: "workHoursPerDay exceeds the employee's available capacity of 1 hours.",
    });
    renderForm();

    await user.click(screen.getByRole("button", { name: "Propose for this project" }));

    expect(await screen.findByText(/available capacity/)).toBeInTheDocument();
    // Still a form, not a success state.
    expect(screen.getByRole("button", { name: "Propose for this project" })).toBeInTheDocument();
    expect(screen.queryByText(/Proposal sent/)).toBeNull();
  });

  it("links a field error to the field it belongs to", async () => {
    const user = userEvent.setup();
    action.mockResolvedValue({
      fieldErrors: { workHoursPerDay: "Enter whole hours per day — at least 1." },
      formError: "Check the highlighted fields.",
    });
    renderForm();

    await user.click(screen.getByRole("button", { name: "Propose for this project" }));

    const hours = await screen.findByLabelText(/Hours per day/);
    expect(hours).toHaveAttribute("aria-invalid", "true");
    expect(hours.getAttribute("aria-describedby")).toBe("hours-error");
    expect(screen.getByText("Enter whole hours per day — at least 1.")).toBeInTheDocument();
  });
});

describe("what is sent", () => {
  it("carries the identifiers as values, never a path", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "Propose for this project" }));

    const formData = action.mock.calls[0]![1];
    expect(formData.get("projectId")).toBe("p1");
    expect(formData.get("employeeId")).toBe("u1");
    expect(formData.getAll("teamRoleId")).toEqual([BACKEND]);
    // Nothing the backend does not accept.
    for (const forbidden of ["departmentId", "organizationId", "proposedBy", "score"]) {
      expect(formData.get(forbidden)).toBeNull();
    }
  });
});

describe("accessibility", () => {
  it("groups the roles and the commitment under real legends", () => {
    renderForm();

    expect(screen.getByRole("group", { name: "Roles" })).toBeInTheDocument();
    const commitment = screen.getByRole("group", { name: "Commitment" });
    expect(within(commitment).getByLabelText(/Hours per day/)).toBeInTheDocument();
  });
});
