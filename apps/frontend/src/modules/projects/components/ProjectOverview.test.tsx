import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AccessRole } from "@/shared/types/accessRole";

import type { ProjectDetails, ProposedMember } from "../model/projectDetail";
import { ownsProject } from "../server/loadProjectViews";
import type { Loaded } from "../server/projectsDataSources";

import { ProjectOverview } from "./ProjectOverview";

/**
 * What a project's overview says, and to whom.
 *
 * The read is relationship-aware — the backend decides who may see a project —
 * but management controls are ownership-aware, which is a different question.
 */

const OWNER = { userId: "pm-1", name: "Deniz Arslan", email: "deniz@potriv.test" };

function details(overrides: Partial<ProjectDetails> = {}): ProjectDetails {
  return {
    projectId: "p1",
    projectName: "Apollo",
    projectStatus: "IN_PROGRESS",
    projectPeriod: "FIXED",
    startDate: "2026-01-05",
    deadlineDate: "2026-09-30",
    generalDescription: "Replatforming the billing service.",
    projectManager: OWNER,
    technologyStack: [{ technologyId: "t1", name: "TypeScript" }],
    teamRoleRequirements: [],
    activeMembers: [],
    pastMembers: [],
    ...overrides,
  };
}

function member(allocationId: string, name: string, roleIds: readonly string[]) {
  return {
    allocationId,
    employee: { userId: `u-${allocationId}`, name, email: `${allocationId}@potriv.test` },
    reviewDepartment: { departmentId: "d1", name: "Platform" },
    workHoursPerDay: 4,
    roles: roleIds.map((teamRoleId) => ({ teamRoleId, name: teamRoleId, active: true })),
    allocatedAt: "2026-02-01T09:00:00Z",
  };
}

function proposal(
  proposalId: string,
  name: string,
  roleIds: readonly string[],
): ProposedMember {
  return {
    proposalId,
    employee: { userId: `u-${proposalId}`, name, email: `${proposalId}@potriv.test` },
    reviewDepartment: { departmentId: "d1", name: "Platform" },
    workHoursPerDay: 4,
    roles: roleIds.map((teamRoleId) => ({ teamRoleId, name: teamRoleId, active: true })),
    comments: null,
    proposedBy: OWNER,
    proposedAt: "2026-02-01T09:00:00Z",
  };
}

/** A team read that answered, carrying only the proposals a test cares about. */
function team(proposedMembers: readonly ProposedMember[] = []) {
  return {
    ok: true as const,
    value: {
      projectId: "p1",
      projectName: "Apollo",
      projectStatus: "IN_PROGRESS" as const,
      projectPeriod: "FIXED" as const,
      startDate: "2026-01-05",
      deadlineDate: "2026-09-30",
      proposedMembers,
      activeMembers: [],
      pastMembers: [],
    },
  };
}

function renderOverview(
  data: ProjectDetails,
  canManage = false,
  teamData: Loaded<ReturnType<typeof team>["value"]> = team(),
) {
  return render(
    <ProjectOverview
      projectId="p1"
      data={{ details: { ok: true, value: data }, team: teamData }}
      canManage={canManage}
    />,
  );
}

/** The cells of one coverage row, in column order. */
function coverageRow(roleName: string): readonly string[] {
  const cell = screen.getByText(roleName).closest("tr") as HTMLElement;
  return Array.from(cell.querySelectorAll("td")).map((td) => td.textContent?.trim() ?? "");
}

describe("requirement fill counts", () => {
  it("shows how many of the people a role asked for are there", () => {
    renderOverview(
      details({
        teamRoleRequirements: [
          {
            requirementId: "r1",
            teamRole: { teamRoleId: "backend", name: "Backend", active: true },
            requiredMembers: 3,
          },
        ],
        activeMembers: [member("a1", "Mehmet Kaya", ["backend"])],
      }),
    );

    // Team role | Needed | Active | Proposed | Open
    expect(coverageRow("Backend")).toEqual(["Backend", "3", "1", "0", "2"]);
  });

  it("never shows a negative gap for an over-filled role", () => {
    renderOverview(
      details({
        teamRoleRequirements: [
          {
            requirementId: "r1",
            teamRole: { teamRoleId: "backend", name: "Backend", active: true },
            requiredMembers: 1,
          },
        ],
        activeMembers: [
          member("a1", "Mehmet Kaya", ["backend"]),
          member("a2", "Elif Demir", ["backend"]),
          member("a3", "Can Yıldız", ["backend"]),
        ],
      }),
    );

    expect(coverageRow("Backend")).toEqual(["Backend", "1", "3", "0", "0"]);
    expect(screen.queryByText(/-\d/)).toBeNull();
  });

  it("counts one person towards two different roles", () => {
    renderOverview(
      details({
        teamRoleRequirements: [
          {
            requirementId: "r1",
            teamRole: { teamRoleId: "backend", name: "Backend", active: true },
            requiredMembers: 1,
          },
          {
            requirementId: "r2",
            teamRole: { teamRoleId: "lead", name: "Lead", active: true },
            requiredMembers: 1,
          },
        ],
        activeMembers: [member("a1", "Mehmet Kaya", ["backend", "lead"])],
      }),
    );

    expect(coverageRow("Backend")).toEqual(["Backend", "1", "1", "0", "0"]);
    expect(coverageRow("Lead")).toEqual(["Lead", "1", "1", "0", "0"]);
  });

  it("marks a requirement whose role was deactivated", () => {
    renderOverview(
      details({
        teamRoleRequirements: [
          {
            requirementId: "r1",
            teamRole: { teamRoleId: "qa", name: "Deprecated QA", active: false },
            requiredMembers: 1,
          },
        ],
      }),
    );

    expect(screen.getByText(/retired role/)).toBeInTheDocument();
  });
});

describe("ownership", () => {
  it("offers Edit to the manager who owns this project", () => {
    renderOverview(details(), true);

    expect(screen.getByRole("link", { name: "Edit project" })).toHaveAttribute(
      "href",
      "/projects/p1/edit",
    );
  });

  it("offers no Edit to a project manager who does not own it", () => {
    // Holding PROJECT_MANAGER says someone can manage projects, not this one.
    renderOverview(details(), false);

    expect(screen.queryByRole("link", { name: "Edit project" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Apollo" })).toBeInTheDocument();
  });

  it("derives ownership from the project's manager, never from the role alone", () => {
    const roles: readonly AccessRole[] = ["EMPLOYEE", "PROJECT_MANAGER"];

    expect(ownsProject(roles, "pm-1", "pm-1")).toBe(true);
    expect(ownsProject(roles, "pm-2", "pm-1")).toBe(false);
    expect(ownsProject(["EMPLOYEE"], "pm-1", "pm-1")).toBe(false);
    expect(ownsProject(roles, "pm-1", null)).toBe(false);
  });
});

describe("content", () => {
  it("says there is no description rather than leaving a gap", () => {
    renderOverview(details({ generalDescription: null }));

    expect(screen.getByText("No description.")).toBeInTheDocument();
  });

  it("renders the description as text, never as markup", () => {
    renderOverview(details({ generalDescription: "<img src=x onerror=alert(1)>" }));

    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("shows technologies as project data, with no link to the skill catalogue", () => {
    renderOverview(details());

    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /TypeScript/ })).toBeNull();
  });

  it("says nobody is allocated rather than showing an empty list", () => {
    renderOverview(details());

    expect(screen.getByText("No one is allocated to this project yet.")).toBeInTheDocument();
  });

  it("invents no metric the backend does not provide", () => {
    renderOverview(details(), true);

    const text = (document.body.textContent ?? "").toLowerCase();
    for (const forbidden of [
      "health",
      "risk",
      "completion",
      "utilization",
      "utilisation",
      "budget",
      "velocity",
      "%",
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("navigates between sections rather than pretending to be tabs", () => {
    renderOverview(details());

    const nav = screen.getByRole("navigation", { name: "Project sections" });
    expect(within(nav).getByRole("link", { current: "page" })).toHaveTextContent("Overview");
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
  });
});

describe("when the project cannot be read", () => {
  it("says the same thing for missing and for not visible", () => {
    render(
      <ProjectOverview
        projectId="p1"
        data={{ details: { ok: false, reason: "NOT_FOUND" }, team: team() }}
        canManage={false}
      />,
    );

    expect(
      screen.getByText("This project does not exist or is not visible to you."),
    ).toBeInTheDocument();
    // Saying this would confirm the project exists.
    expect(document.body.textContent).not.toContain("do not own");
  });

  it("says the same thing for a refusal, so 403 is not an existence oracle", () => {
    // The details endpoint answers 403 to a department manager who manages no
    // department, and 404 to an unrelated employee. Distinct wording would make
    // the difference readable as "this project is real".
    render(
      <ProjectOverview
        projectId="p1"
        data={{ details: { ok: false, reason: "FORBIDDEN" }, team: team() }}
        canManage={false}
      />,
    );

    expect(
      screen.getByText("This project does not exist or is not visible to you."),
    ).toBeInTheDocument();
  });

  it("reports a real outage as an outage", () => {
    render(
      <ProjectOverview
        projectId="p1"
        data={{ details: { ok: false, reason: "ERROR" }, team: team() }}
        canManage={false}
      />,
    );

    expect(screen.getByText(/Could not load this project/)).toBeInTheDocument();
  });
});

/**
 * Proposals on the canonical project page.
 *
 * The product's central distinction: a proposal is not an allocation. Nobody is
 * on the project until a department manager accepts, so a proposed person can
 * never close a position or join the active team.
 */
describe("proposed staffing", () => {
  const requirement = {
    requirementId: "r1",
    teamRole: { teamRoleId: "backend", name: "Backend", active: true },
    requiredMembers: 3,
  };

  it("counts proposals in their own column and does not let them close a position", () => {
    renderOverview(
      details({ teamRoleRequirements: [requirement], activeMembers: [member("a1", "Mehmet Kaya", ["backend"])] }),
      false,
      team([proposal("p-1", "Elif Demir", ["backend"]), proposal("p-2", "Can Yıldız", ["backend"])]),
    );

    // Needed 3, active 1, proposed 2 — and still 2 open, not 0. Two people are
    // waiting on a decision nobody has made.
    expect(coverageRow("Backend")).toEqual(["Backend", "3", "1", "2", "2"]);
  });

  it("says so in words, so the column is not read as progress", () => {
    renderOverview(details({ teamRoleRequirements: [requirement] }));

    expect(
      screen.getByText(/Proposed people are not allocated yet, so they do not reduce it/),
    ).toBeInTheDocument();
  });

  it("keeps proposed people out of the active list entirely", () => {
    renderOverview(details(), false, team([proposal("p-1", "Elif Demir", ["backend"])]));

    const people = screen.getByRole("heading", { name: "People" }).closest("section") as HTMLElement;
    const active = within(people).getByRole("heading", { name: "Active" }).parentElement as HTMLElement;

    expect(within(active).queryByText("Elif Demir")).toBeNull();
    expect(within(people).getByText("Elif Demir")).toBeInTheDocument();
    expect(within(people).getByText(/awaiting department decision/)).toBeInTheDocument();
  });

  it("shows an unread proposal count as unknown, never as none", () => {
    renderOverview(details({ teamRoleRequirements: [requirement] }), false, {
      ok: false,
      reason: "ERROR",
    });

    // "—", not "0": nobody checked, and 0 would state that nobody was proposed.
    expect(coverageRow("Backend")).toEqual(["Backend", "3", "0", "—", "3"]);
    expect(screen.getByText(/Pending proposals could not be read/)).toBeInTheDocument();
  });

  it("distinguishes no pending proposals from unreadable ones", () => {
    renderOverview(details());

    expect(screen.getByText("No pending proposals.")).toBeInTheDocument();
    expect(screen.queryByText(/could not be read/)).toBeNull();
  });

  it("keeps the requirements and the active team when only the team read failed", () => {
    renderOverview(
      details({ teamRoleRequirements: [requirement], activeMembers: [member("a1", "Mehmet Kaya", ["backend"])] }),
      false,
      { ok: false, reason: "ERROR" },
    );

    // A second request failing must not blank the answers the first one gave.
    expect(coverageRow("Backend")).toEqual(["Backend", "3", "1", "—", "2"]);
    expect(screen.getByText("Mehmet Kaya")).toBeInTheDocument();
  });
});
