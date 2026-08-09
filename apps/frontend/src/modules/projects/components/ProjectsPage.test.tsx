import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AccessRole } from "@/shared/types/accessRole";
import type { ProjectStatus } from "@/shared/types/projectStatus";

import type {
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
    roles: [{ teamRoleId: "backend", name: "Backend" }],
    allocatedAt: "2026-01-06T09:00:00Z",
    deallocatedAt: null,
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
    renderPage(["EMPLOYEE", "DEPARTMENT_MANAGER"], departmentView({
      department: { departmentId: "d1", name: "Platform" },
      projects: [],
    }));

    expect(scopeNames()).toEqual(["Department", "My projects"]);
  });

  it("gives an organization admin no project scope of its own", () => {
    // No ordinary-product endpoint returns every project in the organization,
    // so there is no such view to offer.
    renderPage(["EMPLOYEE", "ORGANIZATION_ADMIN"], mineView({
      currentProjects: [],
      pastProjects: [],
    }));

    expect(screen.queryByRole("navigation", { name: "Project views" })).toBeNull();
    for (const invented of ["All projects", "Organization projects", "Company projects"]) {
      expect(screen.queryByText(invented)).toBeNull();
    }
  });

  it("shows nothing to navigate when only one scope is granted", () => {
    renderPage(["EMPLOYEE"], mineView({ currentProjects: [], pastProjects: [] }));

    expect(screen.queryByRole("navigation", { name: "Project views" })).toBeNull();
  });

  it("marks the active scope for assistive technology, not by colour alone", () => {
    renderPage(
      ["EMPLOYEE", "PROJECT_MANAGER", "DEPARTMENT_MANAGER"],
      departmentView({ department: { departmentId: "d1", name: "Platform" }, projects: [] }),
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
      const { unmount } = renderPage(roles, mineView({ currentProjects: [], pastProjects: [] }));

      expect(screen.queryByRole("link", { name: "New project" })).toBeNull();
      unmount();
    }
  });
});

describe("department view", () => {
  const departmentProject = {
    projectId: "p1",
    projectName: "Apollo",
    status: "IN_PROGRESS" as ProjectStatus,
    period: "FIXED" as const,
    startDate: "2026-01-05",
    deadlineDate: "2026-09-30",
    teamMembers: [
      {
        allocationId: "a1",
        employee: { userId: "u1", name: "Mehmet Kaya" },
        workHoursPerDay: 4,
        roles: [{ teamRoleId: "backend", name: "Backend" }],
      },
    ],
  };

  it("names the column for the department's people, not the whole team", () => {
    renderPage(
      ["DEPARTMENT_MANAGER"],
      departmentView({
        department: { departmentId: "d1", name: "Platform" },
        projects: [departmentProject],
      }),
    );

    const headers = within(screen.getByRole("table"))
      .getAllByRole("columnheader")
      .map((header) => header.textContent);

    expect(headers).toEqual(["Project", "Status", "Period", "Dates", "Department members"]);
    expect(headers).not.toContain("Full project team");
  });

  it("shows the department's allocations without summing them into a capacity", () => {
    renderPage(
      ["DEPARTMENT_MANAGER"],
      departmentView({
        department: { departmentId: "d1", name: "Platform" },
        projects: [departmentProject],
      }),
    );

    expect(screen.getByText(/Mehmet Kaya/)).toBeInTheDocument();
    expect(screen.getByText(/Backend, 4 hours\/day/)).toBeInTheDocument();

    const text = (document.body.textContent ?? "").toLowerCase();
    for (const forbidden of ["capacity", "utilization", "utilisation", "total hours", "%"]) {
      expect(text).not.toContain(forbidden);
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
    renderPage(
      ["DEPARTMENT_MANAGER"],
      departmentView({ department: { departmentId: "d1", name: "Platform" }, projects: [] }),
    );

    expect(screen.getByText("No projects involve this department yet.")).toBeInTheDocument();
  });
});

describe("my projects", () => {
  it("separates current from past work", () => {
    renderPage(
      ["EMPLOYEE"],
      mineView({
        currentProjects: [episode({ allocationId: "a1" })],
        pastProjects: [episode({ allocationId: "a2", deallocatedAt: "2026-03-04T17:00:00Z" })],
      }),
    );

    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(["Current projects", "Past projects"]);
  });

  it("shows every allocation episode, including repeats of one project", () => {
    // Two spells on the same project are two true rows.
    renderPage(
      ["EMPLOYEE"],
      mineView({
        currentProjects: [],
        pastProjects: [
          episode({ allocationId: "a1", deallocatedAt: "2026-03-04T17:00:00Z" }),
          episode({ allocationId: "a2", deallocatedAt: "2026-07-09T17:00:00Z" }),
        ],
      }),
    );

    expect(screen.getAllByRole("link", { name: "Apollo" })).toHaveLength(2);
    expect(screen.getByText("4 Mar 2026")).toBeInTheDocument();
    expect(screen.getByText("9 Jul 2026")).toBeInTheDocument();
  });

  it("says a past allocation ended without judging how it went", () => {
    renderPage(
      ["EMPLOYEE"],
      mineView({
        currentProjects: [],
        pastProjects: [episode({ deallocatedAt: "2026-03-04T17:00:00Z" })],
      }),
    );

    const text = document.body.textContent ?? "";
    for (const forbidden of ["Completed", "Successful", "Failed", "Abandoned"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("points an unallocated person at their skills", () => {
    renderPage(["EMPLOYEE"], mineView({ currentProjects: [], pastProjects: [] }));

    expect(screen.getByText("You are not allocated to any project yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review my skills" })).toHaveAttribute(
      "href",
      "/skills",
    );
  });

  it("offers no self-assignment the backend does not support", () => {
    renderPage(["EMPLOYEE"], mineView({ currentProjects: [], pastProjects: [] }));

    const text = document.body.textContent ?? "";
    for (const forbidden of ["Join", "Request allocation", "Find a project", "Apply"]) {
      expect(text).not.toContain(forbidden);
    }
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
