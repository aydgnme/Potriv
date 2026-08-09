import { render, screen } from "@testing-library/react";
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
