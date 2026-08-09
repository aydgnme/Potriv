import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type {
  ActiveMember,
  PastMember,
  ProjectTeam,
  ProposedMember,
} from "../model/projectDetail";

import { ProjectTeamView } from "./ProjectTeamView";

/**
 * Three groups that never merge.
 *
 * A proposal is not an allocation — nobody is on the project until a department
 * manager accepts it — and a past allocation is not a current one. The fixtures
 * use deliberately distinct names so any cross-group mixing is obvious rather
 * than plausible.
 */

const DEPARTMENT = { departmentId: "d1", name: "Platform" };

function person(id: string, name: string) {
  return { userId: id, name, email: `${id}@potriv.test` };
}

function proposed(): ProposedMember {
  return {
    proposalId: "prop-1",
    employee: person("u-prop", "PROPOSED Pelin"),
    reviewDepartment: DEPARTMENT,
    workHoursPerDay: 4,
    roles: [{ teamRoleId: "backend", name: "Backend", active: true }],
    comments: "Needs backend cover",
    proposedBy: person("pm-1", "Deniz Arslan"),
    proposedAt: "2026-03-01T09:00:00Z",
  };
}

function active(): ActiveMember {
  return {
    allocationId: "alloc-1",
    employee: person("u-active", "ACTIVE Ahmet"),
    reviewDepartment: DEPARTMENT,
    workHoursPerDay: 6,
    roles: [{ teamRoleId: "backend", name: "Backend", active: true }],
    allocatedAt: "2026-02-01T09:00:00Z",
    proposedBy: person("pm-1", "Deniz Arslan"),
    approvedBy: person("dm-1", "Selin Kurt"),
    approvedAt: "2026-02-02T09:00:00Z",
  };
}

function past(overrides: Partial<PastMember> = {}): PastMember {
  return {
    allocationId: "alloc-2",
    employee: person("u-past", "PAST Petek"),
    reviewDepartment: DEPARTMENT,
    workHoursPerDay: 3,
    roles: [{ teamRoleId: "qa", name: "QA", active: false }],
    allocatedAt: "2026-01-01T09:00:00Z",
    deallocatedAt: "2026-04-01T17:00:00Z",
    deallocationReason: "Moved to another project",
    deallocationProposedBy: person("pm-1", "Deniz Arslan"),
    deallocationApprovedBy: person("dm-1", "Selin Kurt"),
    deallocationApprovedAt: "2026-04-01T17:00:00Z",
    ...overrides,
  };
}

function team(overrides: Partial<ProjectTeam> = {}): ProjectTeam {
  return {
    projectId: "p1",
    projectName: "Apollo",
    projectStatus: "IN_PROGRESS",
    projectPeriod: "FIXED",
    startDate: "2026-01-05",
    deadlineDate: "2026-09-30",
    proposedMembers: [],
    activeMembers: [],
    pastMembers: [],
    ...overrides,
  };
}

function renderTeam(data: ProjectTeam, canManage = false) {
  return render(
    <ProjectTeamView projectId="p1" data={{ ok: true, value: data }} canManage={canManage} />,
  );
}

/**
 * The route supplies a per-row action; this stands in for it so the view's own
 * rule — active rows only — can be checked without pulling in another module.
 */
function renderTeamWithAction(data: ProjectTeam, canManage: boolean) {
  return render(
    <ProjectTeamView
      projectId="p1"
      data={{ ok: true, value: data }}
      canManage={canManage}
      activeMemberAction={
        canManage
          ? (member) => (
              <button type="button">{`Propose removal for ${member.employee.name}`}</button>
            )
          : undefined
      }
    />,
  );
}

function group(name: string): HTMLElement {
  return screen.getByRole("region", { name });
}

describe("group separation", () => {
  it("keeps proposed, active and past in their own sections", () => {
    renderTeam(
      team({ proposedMembers: [proposed()], activeMembers: [active()], pastMembers: [past()] }),
    );

    expect(within(group("Proposed")).getByText("PROPOSED Pelin")).toBeInTheDocument();
    expect(within(group("Active")).getByText("ACTIVE Ahmet")).toBeInTheDocument();
    expect(within(group("Past")).getByText("PAST Petek")).toBeInTheDocument();
  });

  it("never shows a pending proposal as an allocation", () => {
    renderTeam(team({ proposedMembers: [proposed()], activeMembers: [active()] }));

    expect(within(group("Active")).queryByText("PROPOSED Pelin")).toBeNull();
    expect(within(group("Proposed")).queryByText("ACTIVE Ahmet")).toBeNull();
  });

  it("never shows a past allocation as current", () => {
    renderTeam(team({ activeMembers: [active()], pastMembers: [past()] }));

    expect(within(group("Active")).queryByText("PAST Petek")).toBeNull();
    expect(within(group("Past")).queryByText("ACTIVE Ahmet")).toBeNull();
  });

  it("says a proposal is still waiting on a decision", () => {
    renderTeam(team({ proposedMembers: [proposed()] }));

    expect(within(group("Proposed")).getByText(/Waiting on a department manager/))
      .toBeInTheDocument();
  });

  it("gives each group its own empty state", () => {
    renderTeam(team());

    expect(screen.getByText("No pending proposals.")).toBeInTheDocument();
    expect(screen.getByText("No one is currently allocated to this project.")).toBeInTheDocument();
    expect(screen.getByText("No past allocations.")).toBeInTheDocument();
  });
});

describe("past allocations", () => {
  it("renders a row whose deallocation metadata is missing", () => {
    // Older records predate the removal workflow; the row still has to render.
    renderTeam(
      team({
        pastMembers: [
          past({
            deallocatedAt: null,
            deallocationReason: null,
            deallocationProposedBy: null,
            deallocationApprovedBy: null,
            deallocationApprovedAt: null,
          }),
        ],
      }),
    );

    const row = group("Past");
    expect(within(row).getByText("PAST Petek")).toBeInTheDocument();
    expect(within(row).getByText("No reason recorded")).toBeInTheDocument();
  });

  it("shows a reason when there is one", () => {
    renderTeam(team({ pastMembers: [past()] }));

    expect(within(group("Past")).getByText(/Moved to another project/)).toBeInTheDocument();
  });
});

describe("what the team page does not do", () => {
  it("offers no staffing mutations", () => {
    // Asserted as controls rather than words: "Approved" is a column recording
    // what happened, and a substring check would confuse it with an action.
    renderTeam(team({ proposedMembers: [proposed()], activeMembers: [active()] }), true);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    for (const action of [/^Approve$/, /^Reject$/, /^Propose/, /^Remove/, /Team Finder/]) {
      expect(screen.queryByRole("button", { name: action })).toBeNull();
      expect(screen.queryByRole("link", { name: action })).toBeNull();
    }
  });

  it("derives no capacity from allocated hours", () => {
    renderTeam(team({ activeMembers: [active()] }), true);

    const text = (document.body.textContent ?? "").toLowerCase();
    for (const forbidden of ["capacity", "utilization", "utilisation", "available"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("offers a per-row action on active allocations only", () => {
    // Nobody can be taken off a project they have not joined, or already left.
    renderTeamWithAction(
      team({ proposedMembers: [proposed()], activeMembers: [active()], pastMembers: [past()] }),
      true,
    );

    expect(
      within(group("Active")).getByRole("button", { name: /Propose removal for ACTIVE Ahmet/ }),
    ).toBeInTheDocument();
    expect(within(group("Proposed")).queryByRole("button", { name: /Propose removal/ })).toBeNull();
    expect(within(group("Past")).queryByRole("button", { name: /Propose removal/ })).toBeNull();
  });

  it("offers no per-row action to a reader", () => {
    renderTeamWithAction(team({ activeMembers: [active()] }), false);

    expect(screen.queryByRole("button", { name: /Propose removal/ })).toBeNull();
    // And no empty column left behind.
    expect(
      within(group("Active"))
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).not.toContain("Staffing");
  });

  it("uses the anti-leak sentence when the project cannot be read", () => {
    render(
      <ProjectTeamView projectId="p1" data={{ ok: false, reason: "NOT_FOUND" }} canManage={false} />,
    );

    expect(
      screen.getByText("This project does not exist or is not visible to you."),
    ).toBeInTheDocument();
  });

  it("offers Edit only to the owning manager", () => {
    const { unmount } = renderTeam(team(), false);
    expect(screen.queryByRole("link", { name: "Edit" })).toBeNull();
    unmount();

    renderTeam(team(), true);
    expect(screen.getByRole("link", { name: "Edit" })).toBeInTheDocument();
  });
});
