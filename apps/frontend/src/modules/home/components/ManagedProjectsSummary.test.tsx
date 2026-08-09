import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ManagedProjectWithStaffing } from "../model/homeData";

import { ManagedProjectsSummary } from "./ManagedProjectsSummary";

/**
 * What a project manager actually reads.
 *
 * The fixtures use `requiredMembers > 1` deliberately: a project needing one
 * person would render "1 position still needed" under both the correct
 * calculation and the earlier one that counted understaffed role types, so it
 * would not have caught the bug.
 */

function project(
  overrides: Partial<ManagedProjectWithStaffing> = {},
): ManagedProjectWithStaffing {
  return {
    projectId: "p1",
    name: "Apollo",
    status: "IN_PROGRESS",
    deadlineDate: null,
    teamRoles: [],
    openStaffingSlots: 0,
    ...overrides,
  };
}

function renderSummary(projects: readonly ManagedProjectWithStaffing[]) {
  return render(
    <ManagedProjectsSummary data={{ ok: true, value: projects }} limit={5} />,
  );
}

describe("ManagedProjectsSummary staffing copy", () => {
  it("reports every missing person, not the number of short roles", () => {
    // Backend 3/1 and Frontend 2/1 → three people missing across two roles.
    // The earlier implementation would have said "2".
    renderSummary([project({ openStaffingSlots: 3 })]);

    expect(screen.getByText("3 positions still needed")).toBeInTheDocument();
    expect(screen.queryByText(/roles still needed/)).toBeNull();
  });

  it("uses the singular for a single open position", () => {
    renderSummary([project({ openStaffingSlots: 1 })]);

    expect(screen.getByText("1 position still needed")).toBeInTheDocument();
  });

  it("says the team is staffed when nothing is open", () => {
    renderSummary([project({ openStaffingSlots: 0 })]);

    expect(screen.getByText("Team staffed")).toBeInTheDocument();
  });

  it("says staffing was not checked rather than implying a full team", () => {
    // Beyond the enriched shortlist. "Team staffed" here would be a claim
    // nobody verified.
    renderSummary([project({ openStaffingSlots: null })]);

    expect(screen.getByText("Staffing not checked")).toBeInTheDocument();
    expect(screen.queryByText("Team staffed")).toBeNull();
  });

  it("offers to staff a project, never to assign someone", () => {
    // A project manager proposes; a department manager decides.
    renderSummary([project({ openStaffingSlots: 2 })]);

    expect(screen.getByRole("link", { name: "Staff project" })).toBeInTheDocument();
    expect(screen.queryByText(/Assign/)).toBeNull();
    expect(screen.queryByText(/Approve/)).toBeNull();
  });
});
