import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AccessRole } from "@/shared/types/accessRole";
import type { ProjectStatus } from "@/shared/types/projectStatus";

import type {
  DepartmentProject,
  DepartmentProjectMember,
  DepartmentProjects,
  ManagedProjectWithStaffing,
  MyProjectEpisode,
  MyProjects,
} from "../model/projectsData";
import type { ProjectsQuery } from "../model/projectsQuery";
import type { ProjectsViewData } from "../server/loadProjectsView";

import { ProjectsPage } from "./ProjectsPage";

/**
 * What the Projects screen actually says.
 *
 * Scope navigation is navigation, not a role switcher, and the copy must never
 * claim a capability or a number the backend does not provide.
 */

function query(overrides: Partial<ProjectsQuery> = {}): ProjectsQuery {
  return { view: "managed", status: null, ...overrides };
}

function managed(
  overrides: Partial<ManagedProjectWithStaffing> = {},
): ManagedProjectWithStaffing {
  return {
    projectId: "p1",
    name: "Apollo",
    status: "IN_PROGRESS",
    period: "FIXED",
    startDate: "2026-01-05",
    deadlineDate: "2026-09-30",
    openStaffingSlots: 0,
    ...overrides,
  };
}

function episode(overrides: Partial<MyProjectEpisode> = {}): MyProjectEpisode {
  return {
    allocationId: "a1",
    projectId: "p1",
    projectName: "Apollo",
    projectStatus: "IN_PROGRESS",
    projectPeriod: "FIXED",
    startDate: "2026-01-05",
    deadlineDate: "2026-09-30",
    workHoursPerDay: 4,
    roles: [{ teamRoleId: "backend", name: "Backend", active: true }],
    technologyStack: [{ technologyId: "t1", name: "Java" }],
    allocatedAt: "2026-01-06T09:00:00Z",
    deallocatedAt: null,
    ...overrides,
  };
}

/** The identity and snapshot fields travel with every history response. */
function mine(overrides: Partial<MyProjects> = {}): MyProjects {
  return {
    userId: "u1",
    userName: "Mert Aydogan",
    userEmail: "mert@potriv.test",
    currentProjects: [],
    pastProjects: [],
    generatedAt: "2026-08-12T16:22:00Z",
    ...overrides,
  };
}

function member(
  overrides: Partial<DepartmentProjectMember> = {},
): DepartmentProjectMember {
  return {
    allocationId: "a1",
    assignmentProposalId: "prop-1",
    employee: { userId: "u1", name: "Mehmet Kaya", email: "mehmet@potriv.test" },
    workHoursPerDay: 4,
    roles: [{ teamRoleId: "backend", name: "Backend", active: true }],
    allocatedAt: "2026-03-12T09:00:00Z",
    ...overrides,
  };
}

function departmentProject(overrides: Partial<DepartmentProject> = {}): DepartmentProject {
  return {
    projectId: "p1",
    projectName: "Apollo",
    status: "IN_PROGRESS",
    period: "FIXED",
    startDate: "2026-01-05",
    deadlineDate: "2026-09-30",
    teamMembers: [member()],
    ...overrides,
  };
}

function portfolio(overrides: Partial<DepartmentProjects> = {}): DepartmentProjects {
  return {
    department: { departmentId: "d1", name: "Platform" },
    projects: [],
    generatedAt: "2026-08-12T16:22:00Z",
    ...overrides,
  };
}

function managedView(projects: readonly ManagedProjectWithStaffing[]): ProjectsViewData {
  return { view: "managed", data: { ok: true, value: projects } };
}

function mineView(value: MyProjects): ProjectsViewData {
  return { view: "mine", data: { ok: true, value } };
}

function departmentView(value: DepartmentProjects): ProjectsViewData {
  return { view: "department", data: { ok: true, value } };
}

function renderPage(
  roles: readonly AccessRole[],
  view: ProjectsViewData,
  q: ProjectsQuery = query({ view: view.view }),
) {
  return render(<ProjectsPage roles={roles} query={q} view={view} />);
}

function scopeNav() {
  return screen.getByRole("navigation", { name: "Project views" });
}

function scopeNames(): string[] {
  return within(scopeNav())
    .getAllByRole("link")
    .map((link) => link.textContent ?? "");
}

describe("scope navigation", () => {
  it("offers only the scopes the role set grants, in order", () => {
    renderPage(["EMPLOYEE", "PROJECT_MANAGER", "DEPARTMENT_MANAGER"], managedView([]));

    expect(scopeNames()).toEqual(["Managed", "Department", "My projects"]);
  });

  it("hides managed from someone who is not a project manager", () => {
    renderPage(["EMPLOYEE", "DEPARTMENT_MANAGER"], departmentView(portfolio()));

    expect(scopeNames()).toEqual(["Department", "My projects"]);
  });

  it("gives an organization admin no project scope of its own", () => {
    // No ordinary-product endpoint returns every project in the organization,
    // so there is no such view to offer.
    renderPage(["EMPLOYEE", "ORGANIZATION_ADMIN"], mineView(mine()));

    expect(screen.queryByRole("navigation", { name: "Project views" })).toBeNull();
    for (const invented of ["All projects", "Organization projects", "Company projects"]) {
      expect(screen.queryByText(invented)).toBeNull();
    }
  });

  it("shows nothing to navigate when only one scope is granted", () => {
    renderPage(["EMPLOYEE"], mineView(mine()));

    expect(screen.queryByRole("navigation", { name: "Project views" })).toBeNull();
  });

  it("marks the active scope for assistive technology, not by colour alone", () => {
    renderPage(
      ["EMPLOYEE", "PROJECT_MANAGER", "DEPARTMENT_MANAGER"],
      departmentView(portfolio()),
      query({ view: "department" }),
    );

    const current = within(scopeNav()).getByRole("link", { current: "page" });
    expect(current).toHaveTextContent("Department");
  });

  it("navigates rather than pretending to be tabs", () => {
    // role="tab" would promise arrow-key roving focus and loaded panels; this is
    // a server round trip.
    renderPage(["EMPLOYEE", "PROJECT_MANAGER"], managedView([]));

    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.queryAllByRole("tablist")).toHaveLength(0);
  });

  it("never offers to switch role", () => {
    renderPage(["EMPLOYEE", "PROJECT_MANAGER", "DEPARTMENT_MANAGER"], managedView([]));

    const text = document.body.textContent ?? "";
    for (const forbidden of ["PM mode", "Acting as", "Switch role", "View as"]) {
      expect(text).not.toContain(forbidden);
    }
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});

describe("status filter", () => {
  function filterNav() {
    return screen.getByRole("navigation", { name: "Filter projects by status" });
  }

  it("offers every real status plus All, in words", () => {
    renderPage(["EMPLOYEE", "PROJECT_MANAGER"], managedView([]));

    expect(
      within(filterNav())
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["All statuses", "Not started", "Starting", "In progress", "Closing", "Closed"]);
  });

  it("names the active filter", () => {
    renderPage(
      ["EMPLOYEE", "PROJECT_MANAGER"],
      managedView([]),
      query({ status: "IN_PROGRESS" }),
    );

    expect(within(filterNav()).getByRole("link", { current: true })).toHaveTextContent(
      "In progress",
    );
  });

  it("keeps the current scope in every filter link", () => {
    renderPage(["EMPLOYEE", "PROJECT_MANAGER"], managedView([]), query({ view: "managed" }));

    for (const link of within(filterNav()).getAllByRole("link")) {
      expect(link.getAttribute("href")).toContain("view=managed");
    }
  });

  it("keeps the current filter in every scope link", () => {
    renderPage(
      ["EMPLOYEE", "PROJECT_MANAGER", "DEPARTMENT_MANAGER"],
      managedView([]),
      query({ status: "CLOSING" }),
    );

    for (const link of within(scopeNav()).getAllByRole("link")) {
      expect(link.getAttribute("href")).toContain("status=CLOSING");
    }
  });
});

describe("managed view", () => {
  it("reports open positions, not the number of short roles", () => {
    // Three people missing across two roles. Counting understaffed role types
    // would have said "2".
    renderPage(["PROJECT_MANAGER"], managedView([managed({ openStaffingSlots: 3 })]));

    expect(screen.getByText("3 positions still needed")).toBeInTheDocument();
  });

  it("uses the singular for one open position", () => {
    renderPage(["PROJECT_MANAGER"], managedView([managed({ openStaffingSlots: 1 })]));

    expect(screen.getByText("1 position still needed")).toBeInTheDocument();
  });

  it("says staffing is unavailable rather than claiming a full team", () => {
    renderPage(["PROJECT_MANAGER"], managedView([managed({ openStaffingSlots: null })]));

    expect(screen.getByText("Staffing unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Team staffed")).toBeNull();
  });

  it("keeps the other rows readable when one row's staffing failed", () => {
    renderPage(
      ["PROJECT_MANAGER"],
      managedView([
        managed({ projectId: "a", name: "Apollo", openStaffingSlots: 2 }),
        managed({ projectId: "b", name: "Borealis", openStaffingSlots: null }),
        managed({ projectId: "c", name: "Cassini", openStaffingSlots: 0 }),
      ]),
    );

    expect(screen.getByRole("link", { name: "Apollo" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Borealis" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cassini" })).toBeInTheDocument();
    expect(screen.getByText("2 positions still needed")).toBeInTheDocument();
    expect(screen.getByText("Staffing unavailable")).toBeInTheDocument();
    expect(screen.getByText("Team staffed")).toBeInTheDocument();
  });

  it("uses a real table with named columns", () => {
    renderPage(["PROJECT_MANAGER"], managedView([managed()]));

    const table = screen.getByRole("table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Project", "Status", "Period", "Dates", "Staffing"]);
  });

  it("links each project by name and shows its status in words", () => {
    renderPage(["PROJECT_MANAGER"], managedView([managed({ status: "CLOSING" })]));

    expect(screen.getByRole("link", { name: "Apollo" })).toHaveAttribute("href", "/projects/p1");
    // Scoped to the table: "Closing" is also a filter option, and the row must
    // carry the word itself rather than relying on the badge's colour.
    expect(within(screen.getByRole("table")).getByText("Closing")).toBeInTheDocument();
  });

  it("states a missing deadline instead of inventing or breaking one", () => {
    renderPage(
      ["PROJECT_MANAGER"],
      managedView([managed({ period: "ONGOING", deadlineDate: null })]),
    );

    expect(screen.getByText("Ongoing")).toBeInTheDocument();
    expect(screen.getByText("5 Jan 2026 – no deadline")).toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/i)).toBeNull();
  });

  it("offers a project manager the empty-state create action", () => {
    renderPage(["PROJECT_MANAGER"], managedView([]));

    expect(screen.getByText("No projects yet.")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "New project" })[0]).toHaveAttribute(
      "href",
      "/projects/new",
    );
  });

  it("distinguishes a filtered empty list from an empty portfolio", () => {
    renderPage(["PROJECT_MANAGER"], managedView([]), query({ status: "CLOSED" }));

    expect(screen.getByText("No projects with this status.")).toBeInTheDocument();
    expect(screen.queryByText("No projects yet.")).toBeNull();
  });

  it("says the list could not load without naming the backend", () => {
    renderPage(["PROJECT_MANAGER"], { view: "managed", data: { ok: false, reason: "ERROR" } });

    expect(screen.getByText(/Could not load the projects you manage/)).toBeInTheDocument();
    const text = document.body.textContent ?? "";
    for (const leak of ["500", "http", "/projects/managed", "Exception"]) {
      expect(text).not.toContain(leak);
    }
  });

  it("offers no staffing or lifecycle actions this screen does not own", () => {
    renderPage(["PROJECT_MANAGER"], managedView([managed({ openStaffingSlots: 2 })]));

    const text = document.body.textContent ?? "";
    for (const forbidden of ["Delete", "Edit", "Change status", "Team Finder", "Propose"]) {
      expect(text).not.toContain(forbidden);
    }
  });
});

describe("New project", () => {
  it("is offered to a project manager", () => {
    renderPage(["EMPLOYEE", "PROJECT_MANAGER"], managedView([managed()]));

    expect(screen.getByRole("link", { name: "New project" })).toBeInTheDocument();
  });

  it("is not offered to anyone else", () => {
    for (const roles of [
      ["EMPLOYEE"],
      ["EMPLOYEE", "DEPARTMENT_MANAGER"],
      ["EMPLOYEE", "ORGANIZATION_ADMIN"],
    ] as const) {
      const { unmount } = renderPage(roles, mineView(mine()));

      expect(screen.queryByRole("link", { name: "New project" })).toBeNull();
      unmount();
    }
  });
});

describe("the department portfolio", () => {
  /**
   * Portfolio membership comes from the assignment proposal's review-department
   * snapshot, not from anybody's current department. The two diverge as soon as
   * somebody moves, so the copy has to describe the staffing relationship the
   * response actually carries — and only that.
   */

  function renderPortfolio(overrides: Partial<DepartmentProjects> = {}) {
    return renderPage(["DEPARTMENT_MANAGER"], departmentView(portfolio(overrides)));
  }

  it("describes the staffing relationship, never current membership", () => {
    // This person may since have moved to another department; the response says
    // nothing either way, so neither may the screen.
    renderPortfolio({ projects: [departmentProject()] });

    expect(screen.getByRole("heading", { name: "Staffed through Platform" }))
      .toBeInTheDocument();

    const text = document.body.textContent ?? "";
    for (const claim of [
      "Current member of Platform",
      "Department members",
      "Members of this department",
      "Our current members",
      "Current department members",
    ]) {
      expect(text).not.toContain(claim);
    }
  });

  it("describes the scope by its staffing relationship in the page header too", () => {
    // The header is the first thing read and the easiest place to leave a
    // membership claim behind.
    renderPortfolio({ projects: [departmentProject()] });

    expect(
      screen.getByText("Active allocations staffed through the department you manage."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/department's people/)).toBeNull();
  });

  it("never claims to show the whole project team", () => {
    renderPortfolio({ projects: [departmentProject()] });

    const text = document.body.textContent ?? "";
    for (const claim of ["Full team", "All project members", "Project team"]) {
      expect(text).not.toContain(claim);
    }
  });

  it("shows each allocation's own evidence", () => {
    renderPortfolio({ projects: [departmentProject()] });

    const row = screen.getByRole("row", { name: /Mehmet Kaya/ });
    expect(within(row).getByText("mehmet@potriv.test")).toBeInTheDocument();
    expect(within(row).getByText("Backend")).toBeInTheDocument();
    expect(within(row).getByText("4 hours/day")).toBeInTheDocument();
    // allocatedAt, not the project's start date.
    expect(within(row).getByText("12 Mar 2026")).toBeInTheDocument();
  });

  it("does not link a person to a page only an organization admin may open", () => {
    renderPortfolio({ projects: [departmentProject()] });

    expect(screen.queryByRole("link", { name: "Mehmet Kaya" })).toBeNull();
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).not.toContain("/people/");
    }
    // The project itself stays reachable.
    expect(screen.getByRole("link", { name: "Apollo" })).toHaveAttribute("href", "/projects/p1");
  });

  it("keeps a retired role visible and marked", () => {
    renderPortfolio({
      projects: [
        departmentProject({
          teamMembers: [
            member({
              roles: [{ teamRoleId: "qa", name: "Manual QA", active: false }],
            }),
          ],
        }),
      ],
    });

    const row = screen.getByRole("row", { name: /Mehmet Kaya/ });
    expect(within(row).getByText(/Manual QA/)).toBeInTheDocument();
    expect(within(row).getByText(/retired role/)).toBeInTheDocument();
    // The allocation itself is untouched by the role's retirement.
    expect(within(row).getByText("4 hours/day")).toBeInTheDocument();
  });

  it("states hours per allocation and sums nothing", () => {
    renderPortfolio({
      projects: [
        departmentProject({
          teamMembers: [
            member({ allocationId: "a1", workHoursPerDay: 6 }),
            member({
              allocationId: "a2",
              employee: { userId: "u2", name: "Ayse Yilmaz", email: "ayse@potriv.test" },
              workHoursPerDay: 4,
            }),
          ],
        }),
      ],
    });

    expect(screen.getByText("6 hours/day")).toBeInTheDocument();
    expect(screen.getByText("4 hours/day")).toBeInTheDocument();

    const text = (document.body.textContent ?? "").toLowerCase();
    for (const forbidden of [
      "capacity",
      "utilization",
      "utilisation",
      "total hours",
      "10 hours",
      "%",
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("renders projects and members in the order the backend gave them", () => {
    renderPortfolio({
      projects: [
        departmentProject({ projectId: "p1", projectName: "Early" }),
        departmentProject({
          projectId: "p2",
          projectName: "Ongoing",
          teamMembers: [
            member({ allocationId: "b1", employee: { userId: "u3", name: "Zoe Adams", email: "zoe@potriv.test" } }),
            member({ allocationId: "b2", employee: { userId: "u4", name: "Alp Demir", email: "alp@potriv.test" } }),
          ],
        }),
      ],
    });

    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(["Early", "Ongoing"]);

    // Deliberately not alphabetical: the backend already ordered these, and
    // re-sorting here would silently disagree with it.
    const second = screen.getAllByRole("table")[1];
    expect(
      within(second)
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).getAllByRole("cell")[0]?.textContent),
    ).toEqual(["Zoe Adamszoe@potriv.test", "Alp Demiralp@potriv.test"]);
  });

  it("invents no past portfolio", () => {
    renderPortfolio({ projects: [departmentProject()] });

    const text = document.body.textContent ?? "";
    for (const invented of [
      "Past projects",
      "Previous projects",
      "Previous portfolio",
      "Department history",
      "Past allocations",
    ]) {
      expect(text).not.toContain(invented);
    }
  });

  it("tells a manager with no department that nobody appointed them yet", () => {
    // Holding the role is not the same as managing a department. "Try again"
    // would describe an outage that is not happening.
    renderPage(["DEPARTMENT_MANAGER"], {
      view: "department",
      data: { ok: false, reason: "FORBIDDEN" },
    });

    expect(screen.getByText("You are not managing a department yet.")).toBeInTheDocument();
    expect(screen.getByText(/after an organization admin appoints you/)).toBeInTheDocument();
    expect(screen.queryByText(/Could not load department projects/)).toBeNull();
  });

  it("keeps the Department scope visible for that manager", () => {
    renderPage(
      ["EMPLOYEE", "DEPARTMENT_MANAGER"],
      { view: "department", data: { ok: false, reason: "FORBIDDEN" } },
      query({ view: "department" }),
    );

    expect(scopeNames()).toEqual(["Department", "My projects"]);
  });

  it("still reports a real outage as a failure", () => {
    renderPage(["DEPARTMENT_MANAGER"], {
      view: "department",
      data: { ok: false, reason: "ERROR" },
    });

    expect(screen.getByText(/Could not load department projects/)).toBeInTheDocument();
    expect(screen.queryByText("You are not managing a department yet.")).toBeNull();
  });

  it("gives a real manager with no projects the true empty state", () => {
    renderPortfolio();

    expect(screen.getByText("No projects involve this department yet.")).toBeInTheDocument();
    // Distinct from both the outage and the missing-appointment copy.
    expect(screen.queryByText(/Could not load department projects/)).toBeNull();
    expect(screen.queryByText("You are not managing a department yet.")).toBeNull();
  });
});

describe("my allocation history", () => {
  /**
   * Every claim here is about an *allocation*. The project's lifecycle is
   * separate evidence shown alongside, and the two must never be able to stand
   * in for one another.
   */

  it("names the two groups after the allocation, not the project", () => {
    renderPage(
      ["EMPLOYEE"],
      mineView(
        mine({
          currentProjects: [episode({ allocationId: "a1" })],
          pastProjects: [episode({ allocationId: "a2", deallocatedAt: "2026-03-04T17:00:00Z" })],
        }),
      ),
    );

    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(["Current allocations", "Past allocations"]);
    expect(
      screen.getByText(/Current and past describe your allocation, not the project/),
    ).toBeInTheDocument();
  });

  it("keeps a closed project in the current group", () => {
    // Deallocation is what ends an allocation. A project closing does not.
    renderPage(
      ["EMPLOYEE"],
      mineView(
        mine({
          currentProjects: [episode({ projectStatus: "CLOSED", deallocatedAt: null })],
        }),
      ),
    );

    const current = screen.getByRole("region", { name: "Current allocations" });
    expect(within(current).getByRole("link", { name: "Apollo" })).toBeInTheDocument();
    expect(within(current).getByText("Closed")).toBeInTheDocument();
  });

  it("keeps an in-progress project in the past group", () => {
    renderPage(
      ["EMPLOYEE"],
      mineView(
        mine({
          pastProjects: [
            episode({ projectStatus: "IN_PROGRESS", deallocatedAt: "2026-07-09T17:00:00Z" }),
          ],
        }),
      ),
    );

    const past = screen.getByRole("region", { name: "Past allocations" });
    expect(within(past).getByRole("link", { name: "Apollo" })).toBeInTheDocument();
    expect(within(past).getByText("In progress")).toBeInTheDocument();
  });

  it("shows both episodes when one project was worked on twice", () => {
    // Leaving and rejoining is two allocations with their own hours and windows.
    renderPage(
      ["EMPLOYEE"],
      mineView(
        mine({
          currentProjects: [
            episode({
              allocationId: "episode-2",
              workHoursPerDay: 6,
              allocatedAt: "2026-07-01T09:00:00Z",
            }),
          ],
          pastProjects: [
            episode({
              allocationId: "episode-1",
              workHoursPerDay: 4,
              allocatedAt: "2026-01-06T09:00:00Z",
              deallocatedAt: "2026-03-04T17:00:00Z",
            }),
          ],
        }),
      ),
    );

    const links = screen.getAllByRole("link", { name: "Apollo" });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link).toHaveAttribute("href", "/projects/p1");

    expect(screen.getByText("Allocated 1 Jul 2026")).toBeInTheDocument();
    expect(screen.getByText("6 Jan 2026 → 4 Mar 2026")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  /**
   * The same project, twice, **inside one group**.
   *
   * The test above splits the two episodes across Current and Past, so a dedupe
   * applied per group would leave one in each and still pass it. Somebody who
   * left and rejoined a project twice in the same year has two past episodes,
   * and collapsing them by `projectId` would delete half a career from the
   * record while every other assertion stayed green.
   */
  it("keeps repeated episodes of one project inside the same group", () => {
    renderPage(
      ["EMPLOYEE"],
      mineView(
        mine({
          pastProjects: [
            episode({
              allocationId: "episode-2",
              workHoursPerDay: 6,
              allocatedAt: "2026-07-01T09:00:00Z",
              deallocatedAt: "2026-09-30T17:00:00Z",
            }),
            episode({
              allocationId: "episode-1",
              workHoursPerDay: 4,
              allocatedAt: "2026-01-06T09:00:00Z",
              deallocatedAt: "2026-03-04T17:00:00Z",
            }),
          ],
        }),
      ),
    );

    // Two rows for one project name, in one section.
    const past = screen.getByRole("heading", { name: "Past allocations" }).closest("section");
    expect(past).not.toBeNull();
    const links = within(past as HTMLElement).getAllByRole("link", { name: "Apollo" });
    expect(links).toHaveLength(2);

    // And each keeps its own hours and window, rather than being merged.
    expect(within(past as HTMLElement).getByText("6 Jan 2026 → 4 Mar 2026")).toBeInTheDocument();
    expect(within(past as HTMLElement).getByText("1 Jul 2026 → 30 Sept 2026")).toBeInTheDocument();
    expect(within(past as HTMLElement).getByText("6")).toBeInTheDocument();
    expect(within(past as HTMLElement).getByText("4")).toBeInTheDocument();
  });

  it("keeps the allocation window apart from the project's timeline", () => {
    renderPage(
      ["EMPLOYEE"],
      mineView({
        ...mine(),
        currentProjects: [
          episode({
            startDate: "2026-01-05",
            deadlineDate: "2026-09-30",
            allocatedAt: "2026-03-12T09:00:00Z",
          }),
        ],
      }),
    );

    // The allocation began months after the project did, and both are stated.
    expect(screen.getByText("Allocated 12 Mar 2026")).toBeInTheDocument();
    expect(screen.getByText(/5 Jan 2026 – 30 Sept 2026/)).toBeInTheDocument();
  });

  it("says an ongoing project has no deadline rather than inventing one", () => {
    renderPage(
      ["EMPLOYEE"],
      mineView(
        mine({
          currentProjects: [episode({ projectPeriod: "ONGOING", deadlineDate: null })],
        }),
      ),
    );

    expect(screen.getByText(/no deadline/)).toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/)).toBeNull();
  });

  it("shows the project's stack in backend order, as the project's", () => {
    renderPage(
      ["EMPLOYEE"],
      mineView(
        mine({
          currentProjects: [
            episode({
              technologyStack: [
                { technologyId: "t1", name: "Java" },
                { technologyId: "t2", name: "PostgreSQL" },
              ],
            }),
          ],
        }),
      ),
    );

    expect(screen.getByText("Java, PostgreSQL")).toBeInTheDocument();

    // It is read live off the project, so it cannot be described as a record of
    // what this person used while allocated.
    const text = document.body.textContent ?? "";
    for (const claim of [
      "Technologies you used",
      "Stack during this allocation",
      "Historical stack",
      "Your technologies",
    ]) {
      expect(text).not.toContain(claim);
    }
    expect(
      within(screen.getByRole("table")).getByRole("columnheader", { name: "Project stack" }),
    ).toBeInTheDocument();
  });

  it("keeps a retired role visible and marked", () => {
    renderPage(
      ["EMPLOYEE"],
      mineView(
        mine({
          pastProjects: [
            episode({
              roles: [{ teamRoleId: "backend", name: "Backend Engineer", active: false }],
              deallocatedAt: "2026-03-04T17:00:00Z",
            }),
          ],
        }),
      ),
    );

    expect(screen.getByText(/Backend Engineer/)).toBeInTheDocument();
    expect(screen.getByText(/retired role/)).toBeInTheDocument();
    // The episode is still real; only the role has been retired since.
    expect(screen.getByRole("link", { name: "Apollo" })).toBeInTheDocument();
    const text = document.body.textContent ?? "";
    for (const claim of ["Deleted", "Invalid role", "Unknown role"]) {
      expect(text).not.toContain(claim);
    }
  });

  it("does not merge the roles of two episodes", () => {
    renderPage(
      ["EMPLOYEE"],
      mineView(
        mine({
          currentProjects: [
            episode({
              allocationId: "a2",
              roles: [{ teamRoleId: "lead", name: "Tech Lead", active: true }],
            }),
          ],
          pastProjects: [
            episode({
              allocationId: "a1",
              roles: [{ teamRoleId: "backend", name: "Backend", active: true }],
              deallocatedAt: "2026-03-04T17:00:00Z",
            }),
          ],
        }),
      ),
    );

    const current = screen.getByRole("region", { name: "Current allocations" });
    const past = screen.getByRole("region", { name: "Past allocations" });

    expect(within(current).getByText("Tech Lead")).toBeInTheDocument();
    expect(within(current).queryByText("Backend")).toBeNull();
    expect(within(past).getByText("Backend")).toBeInTheDocument();
    expect(within(past).queryByText("Tech Lead")).toBeNull();
  });

  it("counts allocations rather than projects", () => {
    renderPage(
      ["EMPLOYEE"],
      mineView(
        mine({
          currentProjects: [episode({ allocationId: "a1" })],
          pastProjects: [
            episode({ allocationId: "a2", deallocatedAt: "2026-03-04T17:00:00Z" }),
            episode({ allocationId: "a3", deallocatedAt: "2026-07-09T17:00:00Z" }),
          ],
        }),
      ),
    );

    // All three rows are Apollo, so "3 projects" would be wrong.
    expect(
      screen.getByText(/Mert Aydogan · 1 current allocation · 2 past allocations/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/3 projects/)).toBeNull();
  });

  it("labels the snapshot time as when the response was generated", () => {
    renderPage(["EMPLOYEE"], mineView(mine({ currentProjects: [episode()] })));

    expect(screen.getByText(/Snapshot generated 12 Aug 2026, 16:22 UTC/)).toBeInTheDocument();
    const text = document.body.textContent ?? "";
    for (const claim of ["Last updated", "Last sync", "Last synced", "Updated "]) {
      expect(text).not.toContain(claim);
    }
  });

  it("keeps both sections legible when only one is empty", () => {
    renderPage(["EMPLOYEE"], mineView(mine({ currentProjects: [episode()] })));

    const past = screen.getByRole("region", { name: "Past allocations" });
    expect(within(past).getByText("None.")).toBeInTheDocument();
  });

  it("distinguishes a filtered empty group from a genuinely empty one", () => {
    renderPage(
      ["EMPLOYEE"],
      mineView(mine({ currentProjects: [episode({ projectStatus: "CLOSED" })] })),
      query({ view: "mine", status: "CLOSED" }),
    );

    const past = screen.getByRole("region", { name: "Past allocations" });
    expect(within(past).getByText("None with this project status.")).toBeInTheDocument();
  });

  it("says a past allocation ended without judging how it went", () => {
    renderPage(
      ["EMPLOYEE"],
      mineView(mine({ pastProjects: [episode({ deallocatedAt: "2026-03-04T17:00:00Z" })] })),
    );

    const text = document.body.textContent ?? "";
    for (const forbidden of ["Completed", "Successful", "Failed", "Abandoned"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("points an unallocated person at their skills", () => {
    renderPage(["EMPLOYEE"], mineView(mine()));

    expect(screen.getByText("You are not allocated to any project yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review my skills" })).toHaveAttribute(
      "href",
      "/skills",
    );
  });

  it("offers a way back when a filter emptied the whole history", () => {
    renderPage(["EMPLOYEE"], mineView(mine()), query({ view: "mine", status: "CLOSED" }));

    expect(screen.getByText("No allocations with this project status.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear filter" })).toHaveAttribute(
      "href",
      "/projects?view=mine",
    );
  });

  it("offers no self-assignment the backend does not support", () => {
    renderPage(["EMPLOYEE"], mineView(mine()));

    const text = document.body.textContent ?? "";
    for (const forbidden of ["Join", "Request allocation", "Find a project", "Apply"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("opens a project rather than an allocation that has no route", () => {
    renderPage(["EMPLOYEE"], mineView(mine({ currentProjects: [episode()] })));

    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).not.toContain("/me/projects/");
    }
    expect(screen.getByRole("link", { name: "Apollo" })).toHaveAttribute("href", "/projects/p1");
  });
});

describe("page shell", () => {
  it("has one heading and calls the domain by its name", () => {
    renderPage(["EMPLOYEE", "PROJECT_MANAGER"], managedView([managed()]));

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Projects");
  });

  it("shows no metric the backend does not provide", () => {
    renderPage(
      ["EMPLOYEE", "PROJECT_MANAGER", "DEPARTMENT_MANAGER", "ORGANIZATION_ADMIN"],
      managedView([managed({ openStaffingSlots: 2 })]),
    );

    const text = (document.body.textContent ?? "").toLowerCase();
    for (const forbidden of [
      "capacity",
      "utilization",
      "utilisation",
      "risk",
      "health",
      "notification",
      "recommend",
      "%",
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("invents no pagination the endpoints do not have", () => {
    renderPage(["PROJECT_MANAGER"], managedView([managed()]));

    for (const name of ["Next", "Previous", "Page 1"]) {
      expect(screen.queryByRole("link", { name })).toBeNull();
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });
});
