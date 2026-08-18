import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AccessRole } from "@/shared/types/accessRole";

import type { HomeData } from "../server/loadHome";

import { HomePage } from "./HomePage";

/**
 * One Home, composed from the union of a user's roles.
 *
 * The composition rules worth protecting: shared sections appear once however
 * many roles someone holds, and a role-specific section is **absent** — not
 * empty, not disabled — for anyone who lacks the role.
 */

function data(overrides: Partial<HomeData> = {}): HomeData {
  return {
    myProjects: { ok: true, value: { currentProjects: [], pastProjects: [] } },
    mySkills: { ok: true, value: [] },
    managedProjects: { ok: true, value: [] },
    pendingProposals: { ok: true, value: [] },
    departmentProjects: {
      ok: true,
      value: { department: { name: "Platform Engineering" }, projects: [] },
    },
    departments: { ok: true, value: [] },
    organizationUsers: { ok: true, value: [] },
    teamRoles: { ok: true, value: [] },
    organizationSkills: { ok: true, value: [] },
    ...overrides,
  };
}

function renderHome(roles: readonly AccessRole[], homeData: HomeData = data()) {
  return render(
    <HomePage displayName="Ayşe" roles={roles} data={homeData} previewLimit={5} />,
  );
}

function sectionNames(): string[] {
  return screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent ?? "");
}

describe("HomePage composition", () => {
  it("greets the real user", () => {
    renderHome(["EMPLOYEE"]);

    expect(screen.getByText(/Welcome back, Ayşe/)).toBeInTheDocument();
  });

  it("gives an employee only their own work and skills", () => {
    renderHome(["EMPLOYEE"]);

    expect(sectionNames()).toEqual(["My current work", "My skills"]);
    // Absent rather than empty: an employee has no queue at all.
    expect(screen.queryByText("Pending staffing reviews")).toBeNull();
    expect(screen.queryByText("Projects you manage")).toBeNull();
    expect(screen.queryByText("Organization setup")).toBeNull();
    expect(screen.queryByText("Set up your workspace")).toBeNull();
  });

  it("adds managed projects for a project manager", () => {
    renderHome(["EMPLOYEE", "PROJECT_MANAGER"]);

    expect(sectionNames()).toEqual([
      "Projects you manage",
      "My current work",
      "My skills",
    ]);
    expect(screen.queryByText("Pending staffing reviews")).toBeNull();
  });

  it("puts the review queue first for a department manager", () => {
    renderHome(["EMPLOYEE", "DEPARTMENT_MANAGER"]);

    // The one place another person is blocked comes before anything of one's own.
    expect(sectionNames()).toEqual([
      "Pending staffing reviews",
      "Department projects",
      "My current work",
      "My skills",
    ]);
  });

  it("adds organization setup for an organization admin", () => {
    renderHome(["EMPLOYEE", "ORGANIZATION_ADMIN"]);

    expect(sectionNames()).toEqual([
      "Organization setup",
      "Set up your workspace",
      "My current work",
      "My skills",
    ]);
    // The org-admin role alone has no organization-wide project endpoint.
    expect(screen.queryByText("Projects you manage")).toBeNull();
  });

  it("renders every applicable section exactly once for a multi-role user", () => {
    renderHome(["EMPLOYEE", "PROJECT_MANAGER", "DEPARTMENT_MANAGER", "ORGANIZATION_ADMIN"]);

    const names = sectionNames();
    expect(names).toEqual([
      "Pending staffing reviews",
      "Projects you manage",
      "Department projects",
      "Organization setup",
      // Guidance sits below operational work: a founder with reviews waiting
      // has something more urgent than onboarding.
      "Set up your workspace",
      "My current work",
      "My skills",
    ]);
    // No duplication and no role tabs.
    expect(new Set(names).size).toBe(names.length);
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("keeps the rest of Home when one section failed to load", () => {
    renderHome(
      ["EMPLOYEE", "DEPARTMENT_MANAGER"],
      data({ pendingProposals: { ok: false, reason: "ERROR" } }),
    );

    expect(screen.getByText(/Could not load staffing reviews/)).toBeInTheDocument();
    // Unrelated sections still render.
    expect(screen.getByRole("heading", { level: 2, name: "My current work" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Department projects" })).toBeInTheDocument();
  });

  it("says a manager without a department has nothing waiting, not that loading failed", () => {
    // Holding DEPARTMENT_MANAGER while managing no department gives a 403. That
    // is ownership, not an outage — "try again" would describe a failure that is
    // not happening.
    renderHome(
      ["EMPLOYEE", "DEPARTMENT_MANAGER"],
      data({
        pendingProposals: { ok: false, reason: "FORBIDDEN" },
        departmentProjects: { ok: false, reason: "FORBIDDEN" },
      }),
    );

    expect(screen.getByText(/not managing a department yet, so no staffing requests/))
      .toBeInTheDocument();
    expect(screen.queryByText(/Could not load staffing reviews/)).toBeNull();
    expect(screen.queryByText(/Could not load department projects/)).toBeNull();
  });

  it("never shows a metric the backend does not provide", () => {
    renderHome(["EMPLOYEE", "PROJECT_MANAGER", "DEPARTMENT_MANAGER", "ORGANIZATION_ADMIN"]);

    const text = document.body.textContent ?? "";
    for (const forbidden of [
      "capacity",
      "utilization",
      "utilisation",
      "notification",
      "Suspended",
      "%",
    ]) {
      expect(text.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it("pairs every count with the noun it counts", () => {
    renderHome(
      ["EMPLOYEE", "DEPARTMENT_MANAGER"],
      data({
        pendingProposals: {
          ok: true,
          value: [
            {
              proposalId: "1",
              proposalType: "ASSIGNMENT",
              project: { projectId: "p1", name: "Apollo" },
              employee: { name: "Mehmet Kaya" },
              workHoursPerDay: 4,
              createdAt: "2026-08-01T10:00:00Z",
            },
          ],
        },
      }),
    );

    // "1" alone would mean nothing read aloud.
    expect(screen.getByText("1 request needs your decision")).toBeInTheDocument();
  });
});

describe("workspace setup on Home", () => {
  /**
   * A founder's first sign-in. Every trackable step is genuinely outstanding,
   * and the one that cannot be tracked says so rather than joining them.
   */
  it("gives a fresh workspace real next actions and no invented progress", () => {
    renderHome(
      ["EMPLOYEE", "ORGANIZATION_ADMIN"],
      data({
        departments: { ok: true, value: [] },
        teamRoles: { ok: true, value: [] },
        organizationSkills: { ok: true, value: [] },
        organizationUsers: { ok: true, value: [{ userId: "founder", roles: [] }] },
      }),
    );

    const setup = screen
      .getByRole("heading", { name: "Set up your workspace" })
      .closest("section") as HTMLElement;
    expect(setup).not.toBeNull();

    // Scoped to the section: "Manage skills" is also the My-skills action, and
    // a page-wide query would match whichever came first rather than the step.
    for (const label of [
      "Add department",
      "Manage team roles",
      "Manage skills",
      "Invite people",
      "Create project",
    ]) {
      expect(within(setup).getByRole("link", { name: new RegExp(label, "i") }))
        .toBeInTheDocument();
    }

    // No score, no percentage, no "n of five".
    expect(setup?.textContent ?? "").not.toMatch(/%|\b\d+\s*\/\s*\d+\b|complete[d]?\s*\d/i);
  });

  it("keeps the unmanaged-department warning even once a department exists", () => {
    renderHome(
      ["EMPLOYEE", "ORGANIZATION_ADMIN"],
      data({
        departments: {
          ok: true,
          value: [
            { departmentId: "d1", name: "Platform", manager: null, memberCount: 0 },
          ],
        },
        teamRoles: { ok: true, value: [{ teamRoleId: "t", name: "Backend" }] },
        organizationSkills: { ok: true, value: [{ skillId: "s", name: "Java" }] },
        organizationUsers: {
          ok: true,
          value: [
            { userId: "a", roles: [] },
            { userId: "b", roles: [] },
          ],
        },
      }),
    );

    // Setup says the department step is done; the operational problem that the
    // department has nobody managing it must not disappear with it.
    expect(screen.getByText(/no manager/i)).toBeInTheDocument();
  });

  it("marks the first project neither done nor outstanding", () => {
    renderHome(["EMPLOYEE", "ORGANIZATION_ADMIN"]);

    // The signal does not exist, and the page says so in words rather than
    // leaving a symbol to imply one thing or the other.
    expect(screen.getByText(/completion is not tracked for this step/i))
      .toBeInTheDocument();
  });

  it("shows no setup guidance to anyone who cannot act on it", () => {
    renderHome(["EMPLOYEE", "PROJECT_MANAGER", "DEPARTMENT_MANAGER"]);

    expect(screen.queryByRole("heading", { name: "Set up your workspace" })).toBeNull();
  });

  it("survives a setup source that failed to load", () => {
    renderHome(
      ["EMPLOYEE", "ORGANIZATION_ADMIN"],
      data({ teamRoles: { ok: false, reason: "ERROR" } }),
    );

    // The section still renders and the other steps still work: one failed read
    // is not a reason to withhold the whole checklist.
    expect(screen.getByRole("heading", { name: "Set up your workspace" }))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: /add department/i })).toBeInTheDocument();
  });

  /**
   * The distinction this fix exists for.
   *
   * "Not tracked" describes a permanent hole in the product. Saying it because
   * `/team-roles` happened to fail would blame the product for the network, and
   * would tell the founder something untrue about what Potriv can do.
   */
  it("says a failed read is temporary, never that it is untracked", () => {
    renderHome(
      ["EMPLOYEE", "ORGANIZATION_ADMIN"],
      data({ teamRoles: { ok: false, reason: "ERROR" } }),
    );

    const setup = screen
      .getByRole("heading", { name: "Set up your workspace" })
      .closest("section") as HTMLElement;

    expect(within(setup).getByText(/status could not be checked right now/i))
      .toBeInTheDocument();

    // "Not tracked" belongs to the first-project step alone, and must not have
    // been borrowed for the failed one.
    const notTracked = within(setup).getAllByText(/not tracked for this step/i);
    expect(notTracked).toHaveLength(1);
  });

  it("keeps the action usable while a signal is unavailable", () => {
    renderHome(
      ["EMPLOYEE", "ORGANIZATION_ADMIN"],
      data({ departments: { ok: false, reason: "ERROR" } }),
    );

    const setup = screen
      .getByRole("heading", { name: "Set up your workspace" })
      .closest("section") as HTMLElement;

    // A failed check is not a reason to withhold the thing they came to do.
    expect(within(setup).getByRole("link", { name: /add department/i }))
      .toHaveAttribute("href", "/organization/departments");
  });

  it("does not present an unavailable signal as an error", () => {
    renderHome(
      ["EMPLOYEE", "ORGANIZATION_ADMIN"],
      data({ skills: { ok: false, reason: "ERROR" } } as never),
    );

    const setup = screen
      .getByRole("heading", { name: "Set up your workspace" })
      .closest("section") as HTMLElement;

    // No alert semantics and no failure language: a read that did not answer is
    // not the founder's problem to fix.
    expect(within(setup).queryByRole("alert")).toBeNull();
    expect(setup.textContent ?? "").not.toMatch(/error|failed|went wrong/i);
  });

  it("spells each setup state out in text, not only in a marker", () => {
    renderHome(
      ["EMPLOYEE", "ORGANIZATION_ADMIN"],
      data({
        departments: {
          ok: true,
          value: [{ departmentId: "d", name: "Platform", manager: null, memberCount: 0 }],
        },
        teamRoles: { ok: false, reason: "ERROR" },
      }),
    );

    const setup = screen
      .getByRole("heading", { name: "Set up your workspace" })
      .closest("section") as HTMLElement;
    const text = setup.textContent ?? "";

    // done, unavailable and unknown each say what they are; todo says nothing
    // extra because an ordinary outstanding task needs no explanation.
    expect(text).toMatch(/— done/);
    expect(text).toMatch(/status could not be checked right now/i);
    expect(text).toMatch(/not tracked for this step/i);
  });
});

describe("a department manager without an appointment", () => {
  /**
   * Holding DEPARTMENT_MANAGER is not the same as being appointed to manage a
   * department. The backend answers 403, and that is a statement about
   * standing — not an outage.
   */
  it("separates lacking authority from a failed request", () => {
    renderHome(
      ["EMPLOYEE", "DEPARTMENT_MANAGER"],
      data({
        pendingProposals: { ok: false, reason: "FORBIDDEN" },
        departmentProjects: { ok: false, reason: "FORBIDDEN" },
      }),
    );

    const page = document.body.textContent ?? "";
    expect(page).not.toMatch(/something went wrong|failed to load|try again/i);
  });

  it("reports a real outage as an outage", () => {
    renderHome(
      ["EMPLOYEE", "DEPARTMENT_MANAGER"],
      data({ pendingProposals: { ok: false, reason: "ERROR" } }),
    );

    // ERROR and FORBIDDEN must not collapse into one message: one is about
    // standing, the other about the service.
    const queue = screen
      .getByRole("heading", { name: "Pending staffing reviews" })
      .closest("section");
    expect(queue?.textContent ?? "").toMatch(/could not|unavailable|went wrong/i);
  });
});
