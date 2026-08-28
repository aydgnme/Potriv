"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/shared/ui/Chart";

import type { DashboardChart } from "../model/dashboardOverview";
import styles from "./Home.module.css";

const chartConfig = {
  value: { label: "Count", color: "var(--p-brand)" },
} satisfies ChartConfig;

export function DashboardCharts({ charts }: { readonly charts: readonly DashboardChart[] }) {
  return (
    <div className={styles.chartGrid}>
      {charts.map((chart) => (
        <figure className={styles.chartFigure} key={chart.id}>
          <figcaption className={styles.chartCaption}>
            <span className={styles.chartTitle}>{chart.title}</span>
            <span className={styles.chartDescription}>{chart.description}</span>
          </figcaption>

          <ChartContainer
            config={chartConfig}
            style={{ height: chart.layout === "horizontal" ? chartHeight(chart) : 240 }}
            aria-hidden="true"
          >
            {chart.layout === "horizontal" ? (
              <BarChart
                accessibilityLayer
                data={chart.data}
                layout="vertical"
                margin={{ top: 8, right: 40, bottom: 4, left: 0 }}
              >
                <CartesianGrid horizontal={false} stroke="var(--p-border)" />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--p-text-muted)", fontSize: 12 }}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={112}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--p-text-muted)", fontSize: 12 }}
                  tickFormatter={shortLabel}
                />
                <ChartTooltip
                  cursor={{ fill: "var(--p-surface-hover)" }}
                  content={<ChartTooltipContent valueLabel={chart.valueLabel} />}
                />
                <Bar
                  dataKey="value"
                  fill="var(--color-value)"
                  maxBarSize={22}
                  radius={[0, 3, 3, 0]}
                  isAnimationActive={false}
                >
                  <LabelList
                    dataKey="value"
                    position="right"
                    fill="var(--p-text)"
                    fontSize={12}
                  />
                </Bar>
              </BarChart>
            ) : (
              <BarChart
                accessibilityLayer
                data={chart.data}
                margin={{ top: 22, right: 8, bottom: 4, left: 0 }}
              >
                <CartesianGrid vertical={false} stroke="var(--p-border)" />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tickMargin={10}
                  tick={{ fill: "var(--p-text-muted)", fontSize: 12 }}
                />
                <YAxis
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                  tick={{ fill: "var(--p-text-muted)", fontSize: 12 }}
                />
                <ChartTooltip
                  cursor={{ fill: "var(--p-surface-hover)" }}
                  content={<ChartTooltipContent valueLabel={chart.valueLabel} />}
                />
                <Bar
                  dataKey="value"
                  fill="var(--color-value)"
                  maxBarSize={48}
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                >
                  <LabelList
                    dataKey="value"
                    position="top"
                    fill="var(--p-text)"
                    fontSize={12}
                  />
                </Bar>
              </BarChart>
            )}
          </ChartContainer>

          <ul
            className="p-visually-hidden"
            aria-label={`${chart.title} data`}
          >
            {chart.data.map((item) => (
              <li key={item.label}>
                {item.label}: {item.value} {chart.valueLabel}
              </li>
            ))}
          </ul>
        </figure>
      ))}
    </div>
  );
}

function chartHeight(chart: DashboardChart): number {
  return Math.max(220, chart.data.length * 42 + 56);
}

function shortLabel(value: unknown): string {
  const label = String(value);
  return label.length > 18 ? `${label.slice(0, 17)}…` : label;
}
