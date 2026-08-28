import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DashboardOverview as DashboardOverviewData } from "../model/dashboardOverview";
import { DashboardOverview } from "./DashboardOverview";

const overview: DashboardOverviewData = {
  metrics: [
    {
      id: "organization-members",
      label: "Organization members",
      value: 15,
      context: "in this workspace",
    },
  ],
  charts: [
    {
      id: "project-status",
      title: "Managed project status",
      description: "All projects you manage, grouped by their current status.",
      valueLabel: "Projects",
      layout: "vertical",
      data: [
        { label: "In progress", value: 2 },
        { label: "Not started", value: 1 },
        { label: "Closed", value: 0 },
      ],
    },
  ],
};

describe("DashboardOverview", () => {
  it("presents metrics and an accessible text equivalent for every chart", () => {
    render(<DashboardOverview overview={overview} />);

    const region = screen.getByRole("region", { name: "Operational overview" });
    expect(within(region).getByText("Organization members")).toBeInTheDocument();
    expect(within(region).getByText("15")).toBeInTheDocument();

    const dataList = within(region).getByRole("list", {
      name: "Managed project status data",
    });
    expect(within(dataList).getByText("In progress: 2 Projects")).toBeInTheDocument();
    expect(within(dataList).getByText("Not started: 1 Projects")).toBeInTheDocument();
    expect(within(dataList).getByText("Closed: 0 Projects")).toBeInTheDocument();
  });

  it("does not leave an empty dashboard landmark behind", () => {
    const { container } = render(<DashboardOverview overview={{ metrics: [], charts: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
