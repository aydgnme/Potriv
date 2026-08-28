import type { AccessRole } from "@/shared/types/accessRole";
import type { ProjectStatus } from "@/shared/types/projectStatus";
import { projectStatusLabel } from "@/shared/utils/projectStatus";

import type { HomeData } from "../server/loadHome";

export type DashboardMetric = {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly context: string;
};

export type DashboardChart = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly valueLabel: string;
  readonly layout: "horizontal" | "vertical";
  readonly data: readonly { readonly label: string; readonly value: number }[];
};

export type DashboardOverview = {
  readonly metrics: readonly DashboardMetric[];
  readonly charts: readonly DashboardChart[];
};

const STATUS_ORDER: readonly ProjectStatus[] = ["IN_PROGRESS", "NOT_STARTED", "CLOSED"];

/**
 * Builds only statements the current Home payload can prove.
 *
 * There are deliberately no utilization, capacity, trend or percentage
 * figures here. Home has snapshots and direct counts, not time-series or total
 * availability data, so turning those snapshots into performance scores would
 * make the dashboard look more informed than the product really is.
 */
export function buildDashboardOverview(
  roles: readonly AccessRole[],
  data: HomeData,
): DashboardOverview {
  const metrics: DashboardMetric[] = [];

  if (roles.includes("DEPARTMENT_MANAGER") && data.pendingProposals?.ok) {
    metrics.push({
      id: "pending-reviews",
      label: "Pending reviews",
      value: data.pendingProposals.value.length,
      context: "need a decision",
    });
  }

  if (roles.includes("PROJECT_MANAGER") && data.managedProjects?.ok) {
    metrics.push({
      id: "managed-projects",
      label: "Managed projects",
      value: data.managedProjects.value.length,
      context: "in your portfolio",
    });
  }

  if (roles.includes("ORGANIZATION_ADMIN") && data.organizationUsers?.ok) {
    metrics.push({
      id: "organization-members",
      label: "Organization members",
      value: data.organizationUsers.value.length,
      context: "in this workspace",
    });
  }

  if (roles.includes("ORGANIZATION_ADMIN") && data.departments?.ok) {
    metrics.push({
      id: "departments",
      label: "Departments",
      value: data.departments.value.length,
      context: "configured",
    });
  }

  if (data.myProjects.ok) {
    metrics.push({
      id: "active-projects",
      label: "Active projects",
      value: data.myProjects.value.currentProjects.length,
      context: "on your schedule",
    });
  }

  if (data.mySkills.ok) {
    metrics.push({
      id: "profile-skills",
      label: "Profile skills",
      value: data.mySkills.value.length,
      context: "recorded",
    });
  }

  return {
    metrics: metrics.slice(0, 4),
    charts: [projectStatusChart(roles, data), comparisonChart(roles, data)].filter(
      (chart): chart is DashboardChart => chart !== null,
    ),
  };
}

function projectStatusChart(
  roles: readonly AccessRole[],
  data: HomeData,
): DashboardChart | null {
  if (roles.includes("PROJECT_MANAGER") && data.managedProjects?.ok) {
    return statusChart(
      "managed-project-status",
      "Managed project status",
      "All projects you manage, grouped by their current status.",
      data.managedProjects.value.map((project) => project.status),
    );
  }

  if (roles.includes("DEPARTMENT_MANAGER") && data.departmentProjects?.ok) {
    return statusChart(
      "department-project-status",
      "Department project status",
      `${data.departmentProjects.value.department.name} projects by current status.`,
      data.departmentProjects.value.projects.map((project) => project.status),
    );
  }

  if (!data.myProjects.ok) return null;
  const projects = [
    ...data.myProjects.value.currentProjects,
    ...data.myProjects.value.pastProjects,
  ];
  return statusChart(
    "my-project-status",
    "My project status",
    "Your current and past assignments, grouped by project status.",
    projects.map((project) => project.projectStatus),
  );
}

function statusChart(
  id: string,
  title: string,
  description: string,
  statuses: readonly ProjectStatus[],
): DashboardChart | null {
  if (statuses.length === 0) return null;

  return {
    id,
    title,
    description,
    valueLabel: "Projects",
    layout: "vertical",
    data: STATUS_ORDER.map((status) => ({
      label: projectStatusLabel(status),
      value: statuses.filter((candidate) => candidate === status).length,
    })),
  };
}

function comparisonChart(
  roles: readonly AccessRole[],
  data: HomeData,
): DashboardChart | null {
  if (
    roles.includes("ORGANIZATION_ADMIN") &&
    data.departments?.ok &&
    data.departments.value.length > 0
  ) {
    const departments = [...data.departments.value]
      .sort((left, right) => right.memberCount - left.memberCount)
      .slice(0, 6);
    return {
      id: "department-size",
      title: "Department size",
      description:
        data.departments.value.length > departments.length
          ? "The six largest departments by recorded members."
          : "Recorded members in each department.",
      valueLabel: "Members",
      layout: "horizontal",
      data: departments.map((department) => ({
        label: department.name,
        value: department.memberCount,
      })),
    };
  }

  if (data.myProjects.ok && data.myProjects.value.currentProjects.length > 0) {
    return {
      id: "daily-project-hours",
      title: "Daily project hours",
      description: "Hours per day recorded for your active assignments.",
      valueLabel: "Hours/day",
      layout: "horizontal",
      data: [...data.myProjects.value.currentProjects]
        .sort((left, right) => right.workHoursPerDay - left.workHoursPerDay)
        .slice(0, 6)
        .map((project) => ({
          label: project.projectName,
          value: project.workHoursPerDay,
        })),
    };
  }

  if (roles.includes("PROJECT_MANAGER") && data.managedProjects?.ok) {
    const projects = data.managedProjects.value
      .filter(
        (project): project is typeof project & { readonly openStaffingSlots: number } =>
          project.openStaffingSlots !== null,
      )
      .slice(0, 6);
    if (projects.length > 0) {
      return {
        id: "open-staffing-positions",
        title: "Open staffing positions",
        description: "Known open positions in the checked managed-project shortlist.",
        valueLabel: "Positions",
        layout: "horizontal",
        data: projects.map((project) => ({
          label: project.name,
          value: project.openStaffingSlots,
        })),
      };
    }
  }

  return null;
}
