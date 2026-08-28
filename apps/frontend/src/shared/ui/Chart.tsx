"use client";

import * as React from "react";
import * as RechartsPrimitive from "recharts";

import styles from "./Chart.module.css";

/**
 * Potriv's CSS-module adaptation of shadcn/ui's chart primitive.
 *
 * shadcn/ui deliberately ships charts as owned source rather than a sealed
 * package. This keeps its ChartContainer/ChartTooltip composition while
 * expressing the visual layer through Potriv's existing tokens instead of
 * introducing Tailwind as a second design system.
 */
export type ChartConfig = Record<
  string,
  {
    readonly label?: React.ReactNode;
    readonly color?: string;
  }
>;

type ChartContextValue = { readonly config: ChartConfig };

const ChartContext = React.createContext<ChartContextValue | null>(null);
const INITIAL_DIMENSION = { width: 320, height: 240 } as const;

function useChart(): ChartContextValue {
  const context = React.useContext(ChartContext);
  if (!context) throw new Error("useChart must be used within a ChartContainer");
  return context;
}

export function ChartContainer({
  id,
  className,
  children,
  config,
  initialDimension = INITIAL_DIMENSION,
  style,
  ...props
}: React.ComponentProps<"div"> & {
  readonly config: ChartConfig;
  readonly children: React.ComponentProps<
    typeof RechartsPrimitive.ResponsiveContainer
  >["children"];
  readonly initialDimension?: { readonly width: number; readonly height: number };
}) {
  const uniqueId = React.useId();
  const chartId = `chart-${id ?? uniqueId.replaceAll(":", "")}`;
  const colors = Object.fromEntries(
    Object.entries(config).flatMap(([key, item]) =>
      item.color ? [[`--color-${key}`, item.color]] : [],
    ),
  ) as React.CSSProperties;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={[styles.container, className].filter(Boolean).join(" ")}
        style={{ ...colors, ...style }}
        {...props}
      >
        <RechartsPrimitive.ResponsiveContainer initialDimension={initialDimension}>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

export const ChartTooltip = RechartsPrimitive.Tooltip;

type TooltipEntry = {
  readonly color?: string;
  readonly dataKey?: number | string;
  readonly name?: number | string;
  readonly payload?: Record<string, unknown>;
  readonly value?: unknown;
};

export function ChartTooltipContent({
  active,
  payload,
  label,
  className,
  hideLabel = false,
  valueLabel,
}: {
  readonly active?: boolean;
  readonly payload?: readonly TooltipEntry[];
  readonly label?: unknown;
  readonly className?: string;
  readonly hideLabel?: boolean;
  readonly valueLabel?: string;
}) {
  const { config } = useChart();
  if (!active || !payload?.length) return null;

  return (
    <div
      className={[styles.tooltip, className].filter(Boolean).join(" ")}
      role="status"
    >
      {!hideLabel && label !== undefined ? (
        <p className={styles.tooltipLabel}>{String(label)}</p>
      ) : null}
      <div className={styles.tooltipItems}>
        {payload.map((item, index) => {
          const key = String(item.dataKey ?? item.name ?? "value");
          const itemConfig = config[key];
          const itemLabel = valueLabel ?? itemConfig?.label ?? item.name ?? key;
          const displayValue =
            typeof item.value === "number"
              ? item.value.toLocaleString()
              : String(item.value ?? "");

          return (
            <div className={styles.tooltipItem} key={`${key}-${index}`}>
              <span
                className={styles.tooltipIndicator}
                style={{ backgroundColor: item.color ?? itemConfig?.color }}
                aria-hidden="true"
              />
              <span className={styles.tooltipName}>{itemLabel}</span>
              <span className={styles.tooltipValue}>{displayValue}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
