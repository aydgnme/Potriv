import { describe, expect, it } from "vitest";

import type { HomeData } from "../server/loadHome";
import { buildDashboardOverview } from "./dashboardOverview";

function data(overrides: Partial<HomeData> = {}): HomeData {
  return {
    myProjects: { ok: true, value: { currentProjects: [], pastProjects: [] } },
    mySkills: { ok: true, value: [] },
    managedProjects: { ok: true, value: [] },
    pendingProposals: { ok: true, value: [] },
    departmentProjects: {
      ok: true,
      value: { department: { name: "Platform" }, projects: [] },
    },
    departments: { ok: true, value: [] },
    organizationUsers: { ok: true, value: [] },
    teamRoles: { ok: true, value: [] },
    organizationSkills: { ok: true, value: [] },
    ...overrides,
  };
}

describe("dashboard overview", () => {
  it("prioritizes decision and organization metrics for a multi-role manager", () => {
    const overview = buildDashboardOverview(
      ["EMPLOYEE", "PROJECT_MANAGER", "DEPARTMENT_MANAGER", "ORGANIZATION_ADMIN"],
      data({
        pendingProposals: { ok: true, value: [{}, {}] as never },
        managedProjects: { ok: true, value: [{}, {}, {}] as never },
        organizationUsers: { ok: true, value: Array.from({ length: 15 }, () => ({})) as never },
        departments: { ok: true, value: Array.from({ length: 4 }, () => ({})) as never },
      }),
    );

    expect(overview.metrics.map(({ label, value }) => [label, value])).toEqual([
      ["Pending reviews", 2],
      ["Managed projects", 3],
      ["Organization members", 15],
      ["Departments", 4],
    ]);
  });

  it("groups managed projects by the backend project statuses", () => {
    const overview = buildDashboardOverview(
      ["EMPLOYEE", "PROJECT_MANAGER"],
      data({
        managedProjects: {
          ok: true,
          value: [
            { status: "IN_PROGRESS" },
            { status: "IN_PROGRESS" },
            { status: "NOT_STARTED" },
            { status: "CLOSED" },
          ] as never,
        },
      }),
    );

    expect(overview.charts[0]).toMatchObject({
      title: "Managed project status",
      data: [
        { label: "In progress", value: 2 },
        { label: "Not started", value: 1 },
        { label: "Closed", value: 1 },
      ],
    });
  });

  it("shows the largest departments using their recorded member counts", () => {
    const departments = [
      ["Platform", 8],
      ["Design", 3],
      ["Sales", 5],
      ["People", 2],
      ["Finance", 1],
      ["Research", 4],
      ["Support", 6],
    ].map(([name, memberCount], index) => ({
      departmentId: String(index),
      name: String(name),
      memberCount: Number(memberCount),
      manager: null,
    }));

    const overview = buildDashboardOverview(
      ["EMPLOYEE", "ORGANIZATION_ADMIN"],
      data({ departments: { ok: true, value: departments } }),
    );

    expect(overview.charts.find((chart) => chart.id === "department-size")).toMatchObject({
      description: "The six largest departments by recorded members.",
      data: [
        { label: "Platform", value: 8 },
        { label: "Support", value: 6 },
        { label: "Sales", value: 5 },
        { label: "Research", value: 4 },
        { label: "Design", value: 3 },
        { label: "People", value: 2 },
      ],
    });
  });

  it("uses direct daily hours for an employee instead of inventing utilization", () => {
    const overview = buildDashboardOverview(
      ["EMPLOYEE"],
      data({
        myProjects: {
          ok: true,
          value: {
            currentProjects: [
              { projectName: "Apollo", workHoursPerDay: 6 },
              { projectName: "Beacon", workHoursPerDay: 2 },
            ] as never,
            pastProjects: [],
          },
        },
      }),
    );

    expect(overview.charts.find((chart) => chart.id === "daily-project-hours")).toMatchObject({
      valueLabel: "Hours/day",
      data: [
        { label: "Apollo", value: 6 },
        { label: "Beacon", value: 2 },
      ],
    });
    expect(JSON.stringify(overview).toLowerCase()).not.toContain("utilization");
    expect(JSON.stringify(overview)).not.toContain("%");
  });

  it("omits a chart when its source is unavailable", () => {
    const overview = buildDashboardOverview(
      ["EMPLOYEE"],
      data({
        myProjects: { ok: false, reason: "ERROR" },
        mySkills: { ok: false, reason: "ERROR" },
      }),
    );

    expect(overview.metrics).toEqual([]);
    expect(overview.charts).toEqual([]);
  });
});
