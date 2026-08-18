import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type {
  Candidate,
  StaffingProjectContext,
  TeamFinderResult,
} from "../model/teamFinderData";
import { normalizeTeamFinderQuery } from "../model/teamFinderQuery";
import type { TeamFinderState } from "../server/loadTeamFinder";
import type { Loaded } from "../server/staffingDataSources";
import type { ProjectProposedMembers } from "../model/teamFinderData";

import { TeamFinderScreen } from "./TeamFinderScreen";

/**
 * What Team Finder says on screen.
 *
 * The ranking is the backend's deterministic arithmetic; this side has to show
 * it without embellishing it. Every number rendered here is asserted against the
 * fixture value, because a frontend that recomputed a component would be a
 * second, quieter scoring model.
 */

vi.mock("../server/actions/proposalActions", () => ({
  proposeAssignmentAction: vi.fn(async () => ({ fieldErrors: {} })),
}));

const PROJECT_ID = "p1";

function project(overrides: Partial<StaffingProjectContext> = {}): StaffingProjectContext {
  return {
    projectId: PROJECT_ID,
    projectName: "Apollo",
    projectStatus: "IN_PROGRESS",
    projectPeriod: "FIXED",
    startDate: "2026-01-05",
    deadlineDate: "2026-09-30",
    projectManager: { userId: "pm-1", name: "Deniz", email: "deniz@potriv.test" },
    technologyStack: [{ technologyId: "t1", name: "TypeScript" }],
    teamRoleRequirements: [
      {
        requirementId: "r1",
        teamRole: { teamRoleId: "backend", name: "Backend", active: true },
        requiredMembers: 3,
      },
    ],
    activeMembers: [],
    ...overrides,
  };
}

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    employee: { userId: "u1", name: "Elif Demir", email: "elif@potriv.test" },
    department: { departmentId: "d1", name: "Platform Engineering" },
    availability: {
      allocatedHours: 2,
      availableHours: 6,
      activeAllocationCount: 1,
      fullyAvailable: false,
      partiallyAvailable: true,
      unavailable: false,
      closeToFinish: false,
      closeToFinishProjects: [],
      ...overrides.availability,
    },
    skillMatches: [
      {
        technologyName: "TypeScript",
        skillId: "s1",
        skillName: "TypeScript",
        categoryName: "Languages",
        level: { label: "Does" },
        experience: { label: "1–2 years" },
      },
    ],
    pastProjectMatches: [],
    score: { skillScore: 45, pastProjectScore: 20, availabilityScore: 15, totalScore: 80 },
    ...overrides,
  };
}

function result(overrides: Partial<TeamFinderResult> = {}): TeamFinderResult {
  return {
    projectId: PROJECT_ID,
    generatedAt: "2026-08-09T10:00:00Z",
    criteria: {
      includePartiallyAvailable: false,
      includeCloseToFinish: false,
      closeToFinishWeeks: null,
      includeUnavailable: false,
      limit: 50,
    },
    candidateCount: 1,
    candidates: [candidate()],
    ...overrides,
  };
}

/** Pending proposals as the team read returns them. Empty unless a test says otherwise. */
function proposedMembers(
  roles: readonly (readonly string[])[] = [],
): Loaded<ProjectProposedMembers> {
  return {
    ok: true,
    value: {
      proposedMembers: roles.map((teamRoleIds, index) => ({
        proposalId: `prop-${index}`,
        roles: teamRoleIds.map((teamRoleId) => ({ teamRoleId })),
      })),
    },
  };
}

function ready(
  overrides: Partial<TeamFinderResult> = {},
  context = project(),
  proposed: Loaded<ProjectProposedMembers> = proposedMembers(),
): TeamFinderState {
  return {
    kind: "ready",
    project: context,
    result: { ok: true, value: result(overrides) },
    proposed,
  };
}

/** The candidate buttons in list order, ignoring the page's other controls. */
function candidateNames(): string[] {
  return [...document.querySelectorAll("button[aria-pressed]")].map(
    (button) => button.textContent ?? "",
  );
}

function renderScreen(state: TeamFinderState, params: Record<string, string> = {}) {
  return render(
    <TeamFinderScreen
      projectId={PROJECT_ID}
      criteria={normalizeTeamFinderQuery(params)}
      state={state}
    />,
  );
}

describe("product language", () => {
  it("never calls the ranking clever", () => {
    // It is deterministic arithmetic over declared facts, and saying otherwise
    // would invite people to trust it differently than it deserves.
    renderScreen(ready());

    const text = document.body.textContent ?? "";
    // Whole words: "AI" as a substring lives inside "available" and "remaining".
    for (const forbidden of [
      /\bAI\b/i,
      /smart match/i,
      /intelligent/i,
      /recommend/i,
      /best person/i,
      /perfect fit/i,
      /top talent/i,
    ]) {
      expect(text).not.toMatch(forbidden);
    }
  });
});

describe("score evidence", () => {
  it("renders each backend component with its maximum, and the total", () => {
    renderScreen(ready());

    expect(screen.getByText("45 / 60")).toBeInTheDocument();
    expect(screen.getByText("20 / 20")).toBeInTheDocument();
    expect(screen.getByText("15 / 20")).toBeInTheDocument();
    expect(screen.getAllByText("80 / 100").length).toBeGreaterThan(0);
  });

  it("renders whatever the backend said, without recomputing it", () => {
    // Deliberately inconsistent components: the frontend is not the arbiter.
    renderScreen(
      ready({
        candidates: [
          candidate({
            score: { skillScore: 12, pastProjectScore: 0, availabilityScore: 3, totalScore: 99 },
          }),
        ],
      }),
    );

    expect(screen.getByText("12 / 60")).toBeInTheDocument();
    expect(screen.getAllByText("99 / 100").length).toBeGreaterThan(0);
  });

  it("keeps the same score when level and experience differ", () => {
    // Levels are context. They carry no points, and the copy says so.
    const { unmount } = renderScreen(ready());
    expect(screen.getByText("45 / 60")).toBeInTheDocument();
    unmount();

    renderScreen(
      ready({
        candidates: [
          candidate({
            skillMatches: [
              {
                technologyName: "TypeScript",
                skillId: "s1",
                skillName: "TypeScript",
                categoryName: "Languages",
                level: { label: "Teaches" },
                experience: { label: "5+ years" },
              },
            ],
          }),
        ],
      }),
    );

    expect(screen.getByText("45 / 60")).toBeInTheDocument();
    expect(screen.getByText("Teaches · 5+ years")).toBeInTheDocument();
    expect(
      screen.getByText(/Skill levels and experience are context only/),
    ).toBeInTheDocument();
  });

  it("shows no gauge, grade or verdict", () => {
    renderScreen(ready());

    expect(document.querySelector("progress")).toBeNull();
    expect(document.querySelector("meter")).toBeNull();
    const text = (document.body.textContent ?? "").toLowerCase();
    for (const forbidden of ["strong candidate", "grade", "excellent", "poor"]) {
      expect(text).not.toContain(forbidden);
    }
  });
});

describe("availability evidence", () => {
  function withAvailability(availability: Partial<Candidate["availability"]>) {
    return ready({ candidates: [candidate({ availability: availability as never })] });
  }

  it("names the base capacity state", () => {
    renderScreen(
      withAvailability({
        allocatedHours: 0,
        availableHours: 8,
        activeAllocationCount: 0,
        fullyAvailable: true,
        partiallyAvailable: false,
        unavailable: false,
        closeToFinish: false,
        closeToFinishProjects: [],
      }),
    );

    expect(screen.getAllByText(/Fully available/).length).toBeGreaterThan(0);
  });

  it("keeps close-to-finish alongside partial availability, not instead of it", () => {
    renderScreen(
      withAvailability({
        allocatedHours: 6,
        availableHours: 2,
        activeAllocationCount: 2,
        fullyAvailable: false,
        partiallyAvailable: true,
        unavailable: false,
        closeToFinish: true,
        closeToFinishProjects: [
          {
            projectId: "p9",
            projectName: "Borealis",
            deadlineDate: "2026-09-01",
            workHoursPerDay: 4,
          },
        ],
      }),
    );

    const detail = screen.getByRole("region", { name: "Availability" });
    expect(within(detail).getByText(/Partially available/)).toBeInTheDocument();
    expect(within(detail).getByText(/Close to finishing other work/)).toBeInTheDocument();
    expect(within(detail).getByText("Borealis")).toBeInTheDocument();
    // A deadline is when work is due, not a promise of free hours.
    expect(within(detail).getByText(/A deadline is context/)).toBeInTheDocument();
  });

  it("keeps close-to-finish alongside being unavailable", () => {
    renderScreen(
      withAvailability({
        allocatedHours: 8,
        availableHours: 0,
        activeAllocationCount: 1,
        fullyAvailable: false,
        partiallyAvailable: false,
        unavailable: true,
        closeToFinish: true,
        closeToFinishProjects: [
          {
            projectId: "p9",
            projectName: "Borealis",
            deadlineDate: "2026-09-01",
            workHoursPerDay: 8,
          },
        ],
      }),
    );

    const detail = screen.getByRole("region", { name: "Availability" });
    expect(within(detail).getByText(/Unavailable/)).toBeInTheDocument();
    expect(within(detail).getByText(/Close to finishing other work/)).toBeInTheDocument();
  });

  it("reports hours without inventing a working day", () => {
    renderScreen(ready());

    expect(screen.getByText("6 h")).toBeInTheDocument();
    expect(screen.getByText("2 h")).toBeInTheDocument();
    // "6 of 8 h" would copy a backend constant the payload never sent.
    expect(document.body.textContent).not.toContain("of 8 h");
  });
});

describe("candidate count", () => {
  it("says how many came back, not how many exist", () => {
    // The service sorts, limits, then counts. At the limit, this is a page of
    // results and calling it a total would be a number nobody computed.
    renderScreen(
      ready({
        candidateCount: 50,
        criteria: {
          includePartiallyAvailable: false,
          includeCloseToFinish: false,
          closeToFinishWeeks: null,
          includeUnavailable: false,
          limit: 50,
        },
        candidates: Array.from({ length: 50 }, (_, index) =>
          candidate({
            employee: { userId: `u${index}`, name: `Person ${index}`, email: `p${index}@x.test` },
          }),
        ),
      }),
    );

    expect(screen.getByText("50 candidates returned · limit 50")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("total matches");
  });

  it("just counts them when the limit was not reached", () => {
    renderScreen(ready());

    expect(screen.getByText("1 candidate")).toBeInTheDocument();
  });
});

describe("effective criteria", () => {
  it("reports what the backend used, not what the URL asked for", () => {
    // The URL said nothing about the window; the backend filled in two weeks.
    renderScreen(
      ready({
        criteria: {
          includePartiallyAvailable: true,
          includeCloseToFinish: true,
          closeToFinishWeeks: 2,
          includeUnavailable: false,
          limit: 50,
        },
      }),
      { includeCloseToFinish: "true", includePartiallyAvailable: "true" },
    );

    expect(screen.getByText(/within 2 weeks/)).toBeInTheDocument();
    expect(screen.getByText(/at most 50 candidates/)).toBeInTheDocument();
  });
});

describe("selection", () => {
  it("selects the first backend-ranked candidate to begin with", () => {
    renderScreen(
      ready({
        candidateCount: 2,
        candidates: [
          candidate(),
          candidate({
            employee: { userId: "u2", name: "Can Yıldız", email: "can@potriv.test" },
          }),
        ],
      }),
    );

    expect(screen.getByRole("button", { name: /Elif Demir/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("heading", { level: 2, name: "Elif Demir" })).toBeInTheDocument();
  });

  it("marks the selection in words as well as in style", () => {
    renderScreen(ready());

    expect(screen.getByRole("button", { name: /Selected/ })).toBeInTheDocument();
  });

  it("switches candidate without re-running the finder", async () => {
    // The finder already returned everyone. Re-ranking the organization to look
    // at a second person would be work nobody asked for.
    const user = userEvent.setup();
    renderScreen(
      ready({
        candidateCount: 2,
        candidates: [
          candidate(),
          candidate({
            employee: { userId: "u2", name: "Can Yıldız", email: "can@potriv.test" },
            score: { skillScore: 30, pastProjectScore: 0, availabilityScore: 20, totalScore: 50 },
          }),
        ],
      }),
    );

    await user.click(screen.getByRole("button", { name: /Can Yıldız/ }));

    expect(screen.getByRole("heading", { level: 2, name: "Can Yıldız" })).toBeInTheDocument();
    expect(screen.getByText("30 / 60")).toBeInTheDocument();
  });

  it("is reachable by keyboard, with no clickable divs", () => {
    renderScreen(ready());

    expect(screen.getAllByRole("button", { name: /Elif Demir/ })).toHaveLength(1);
    expect(document.querySelectorAll("div[onclick]")).toHaveLength(0);
  });
});

describe("sorting", () => {
  it("defaults to the backend's order", () => {
    renderScreen(
      ready({
        candidateCount: 2,
        candidates: [
          candidate({
            employee: { userId: "u1", name: "First Ranked", email: "a@x.test" },
            score: { skillScore: 10, pastProjectScore: 0, availabilityScore: 20, totalScore: 30 },
          }),
          candidate({
            employee: { userId: "u2", name: "Second Ranked", email: "b@x.test" },
            score: { skillScore: 60, pastProjectScore: 0, availabilityScore: 0, totalScore: 60 },
          }),
        ],
      }),
    );

    // Backend order stands even though the second has more skill points.
    expect(candidateNames()[0]).toContain("First Ranked");
  });

  it("re-orders the returned set without asking the backend again", async () => {
    const user = userEvent.setup();
    renderScreen(
      ready({
        candidateCount: 2,
        candidates: [
          candidate({
            employee: { userId: "u1", name: "First Ranked", email: "a@x.test" },
            score: { skillScore: 10, pastProjectScore: 0, availabilityScore: 20, totalScore: 30 },
          }),
          candidate({
            employee: { userId: "u2", name: "Second Ranked", email: "b@x.test" },
            score: { skillScore: 60, pastProjectScore: 0, availabilityScore: 0, totalScore: 60 },
          }),
        ],
      }),
    );

    await user.selectOptions(screen.getByLabelText("Sort returned candidates"), "skillScore");

    expect(candidateNames()[0]).toContain("Second Ranked");
  });
});

describe("empty and blocked states", () => {
  it("says a project with no technologies has nothing to match on", () => {
    renderScreen({ kind: "no-technologies", project: project({ technologyStack: [] }) });

    expect(
      screen.getByText("This project has no technologies to match on yet."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit project" })).toHaveAttribute(
      "href",
      "/projects/p1/edit",
    );
    // A different thing from having searched and found nobody.
    expect(screen.queryByText(/No candidates matched/)).toBeNull();
  });

  it("says no candidates matched when the search ran and found none", () => {
    renderScreen(ready({ candidateCount: 0, candidates: [] }));

    expect(screen.getByText("No candidates matched these criteria.")).toBeInTheDocument();
    expect(screen.queryByText(/no technologies to match on/)).toBeNull();
  });

  it("tells a reader that staffing belongs to the project's manager", () => {
    renderScreen({ kind: "not-owner", project: project() });

    expect(screen.getByText("Only this project's manager can staff it.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Propose/ })).toBeNull();
  });

  it("uses the anti-leak sentence when the project cannot be read", () => {
    renderScreen({ kind: "unavailable", reason: "NOT_FOUND" });

    expect(
      screen.getByText("This project does not exist or is not visible to you."),
    ).toBeInTheDocument();
  });

  it("reports a real outage as an outage", () => {
    renderScreen({ kind: "unavailable", reason: "ERROR" });

    expect(screen.getByText(/Could not load this project/)).toBeInTheDocument();
  });

  it("says a project with no role requirements can still match on skills", () => {
    renderScreen(ready({}, project({ teamRoleRequirements: [] })));

    expect(screen.getByText(/Skills still match on technologies/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Elif Demir/ })).toBeInTheDocument();
  });
});

describe("candidate detail sections", () => {
  it("shows a real empty state when nothing matched", () => {
    renderScreen(
      ready({ candidates: [candidate({ skillMatches: [], pastProjectMatches: [] })] }),
    );

    expect(
      screen.getByText("No skills matched this project's technologies."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No past projects matched this project's work."),
    ).toBeInTheDocument();
  });

  it("names a past project without linking to one it may not open", () => {
    // Team Finder returning a past project id does not mean this manager has a
    // relationship to that project.
    renderScreen(
      ready({
        candidates: [
          candidate({
            pastProjectMatches: [
              {
                projectId: "past-1",
                projectName: "Cassini",
                matchedTechnologies: ["TypeScript"],
                matchedTeamRoles: ["Backend"],
                deallocatedAt: "2026-03-04T17:00:00Z",
              },
            ],
          }),
        ],
      }),
    );

    expect(screen.getByText("Cassini")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Cassini" })).toBeNull();
    // Nothing about how it went, or why they left.
    const text = document.body.textContent ?? "";
    for (const forbidden of ["performed", "success", "failed", "left because"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("names the department without linking to admin-only detail", () => {
    renderScreen(ready());

    expect(screen.getAllByText(/Platform Engineering/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /Platform Engineering/ })).toBeNull();
  });
});

/**
 * Team composition on the workbench.
 *
 * The manager has to see what the project still needs before deciding who to
 * ask for — and has to see that a gap already has requests standing against it
 * without those requests being mistaken for people.
 */
describe("team composition", () => {
  const withRequirements = () =>
    project({
      teamRoleRequirements: [
        {
          requirementId: "r1",
          teamRole: { teamRoleId: "backend", name: "Backend Engineer", active: true },
          requiredMembers: 3,
        },
      ],
      activeMembers: [
        {
          allocationId: "a1",
          employee: { userId: "u1", name: "Mehmet Kaya", email: "m@potriv.test" },
          roles: [{ teamRoleId: "backend" }],
        },
      ],
    });

  /** The cells of one composition row, in column order. */
  function compositionRow(roleName: string): readonly string[] {
    const row = screen.getByText(roleName, { selector: "th" }).closest("tr") as HTMLElement;
    return [
      row.querySelector("th")?.textContent?.trim() ?? "",
      ...[...row.querySelectorAll("td")].map((cell) => cell.textContent?.trim() ?? ""),
    ];
  }

  it("shows needed, active, proposed and open — and does not let proposals close a position", () => {
    renderScreen(ready({}, withRequirements(), proposedMembers([["backend"]])));

    // Needed 3, active 1, proposed 1 → open 2. Never 1.
    expect(compositionRow("Backend Engineer")).toEqual([
      "Backend Engineer",
      "3",
      "1",
      "1",
      "2",
    ]);
  });

  it("says in words that proposals do not reduce open", () => {
    renderScreen(ready({}, withRequirements(), proposedMembers([["backend"]])));

    expect(
      screen.getByText(/Proposed people are waiting on a department manager and are not allocated/),
    ).toBeInTheDocument();
  });

  it("shows proposed as unknown, never zero, when the team read failed", () => {
    renderScreen(ready({}, withRequirements(), { ok: false, reason: "ERROR" }));

    expect(compositionRow("Backend Engineer")).toEqual([
      "Backend Engineer",
      "3",
      "1",
      "—",
      "2",
    ]);
    expect(screen.getByText(/unknown rather than zero/)).toBeInTheDocument();
  });

  it("keeps the candidates usable when only the team read failed", () => {
    renderScreen(ready({}, withRequirements(), { ok: false, reason: "ERROR" }));

    // A failed composition read must not cost the manager the workbench.
    expect(candidateNames().length).toBeGreaterThan(0);
  });

  it("invents no staffing percentage or health score", () => {
    renderScreen(ready({}, withRequirements(), proposedMembers([["backend"]])));

    const text = (document.body.textContent ?? "").toLowerCase();
    for (const forbidden of ["%", "health", "confidence", "best fit", "recommended", "ideal"]) {
      expect(text).not.toContain(forbidden);
    }
  });
});

/**
 * The candidate table.
 *
 * A hundred candidates have to stay scannable, and selecting one must be
 * reachable by keyboard — so the row is data and the name cell holds a button.
 */
describe("candidate table", () => {
  it("is a real table with real column headers", () => {
    renderScreen(ready());

    for (const header of ["Candidate", "Department", "Availability", "Matched evidence", "Score"]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
  });

  it("makes the name a button rather than making the row clickable", () => {
    renderScreen(ready());

    const button = document.querySelector("button[aria-pressed]") as HTMLElement;
    expect(button).not.toBeNull();
    expect(button.tagName).toBe("BUTTON");
    // A bare row handler would be unreachable by keyboard.
    expect(document.querySelector("tr[onclick]")).toBeNull();
  });

  it("shows the backend score verbatim and computes nothing of its own", () => {
    renderScreen(ready());

    expect(screen.getAllByText(/\/ 100/).length).toBeGreaterThan(0);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/★|stars?\b|Excellent|Strong match|Weak match/i);
  });
});
