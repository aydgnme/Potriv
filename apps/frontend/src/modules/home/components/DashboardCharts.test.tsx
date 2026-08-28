import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DashboardChart } from "../model/dashboardOverview";
import { DashboardCharts } from "./DashboardCharts";

const charts: readonly DashboardChart[] = [
  {
    id: "project-status",
    title: "Managed project status",
    description: "All projects you manage, grouped by their current status.",
    valueLabel: "Projects",
    layout: "vertical",
    data: [
      { label: "In progress", value: 2 },
      { label: "Not started", value: 2 },
      { label: "Closed", value: 1 },
    ],
  },
  {
    id: "department-size",
    title: "Department size",
    description: "Recorded members in each department.",
    valueLabel: "People",
    layout: "horizontal",
    data: [
      { label: "Platform Engineering", value: 5 },
      { label: "Product & Design", value: 4 },
    ],
  },
];

describe("DashboardCharts", () => {
  it("renders both chart layouts while keeping complete data available to assistive tech", () => {
    const { container } = render(<DashboardCharts charts={charts} />);

    expect(screen.getByText("Managed project status")).toBeInTheDocument();
    expect(screen.getByText("Department size")).toBeInTheDocument();

    const projectData = screen.getByRole("list", {
      name: "Managed project status data",
    });
    expect(within(projectData).getByText("In progress: 2 Projects")).toBeInTheDocument();
    expect(within(projectData).getByText("Closed: 1 Projects")).toBeInTheDocument();

    const departmentData = screen.getByRole("list", { name: "Department size data" });
    expect(
      within(departmentData).getByText("Platform Engineering: 5 People"),
    ).toBeInTheDocument();

    const chartContainers = container.querySelectorAll('[data-slot="chart"]');
    expect(chartContainers).toHaveLength(2);
    expect(chartContainers[0]).toHaveAttribute("aria-hidden", "true");
    expect(chartContainers[0]).toHaveStyle({ height: "240px" });
    expect(chartContainers[1]).toHaveAttribute("aria-hidden", "true");
    expect(chartContainers[1]).toHaveStyle({ height: "220px" });
  });
});
