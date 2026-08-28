import type { DashboardOverview as DashboardOverviewData } from "../model/dashboardOverview";

import { DashboardCharts } from "./DashboardCharts";
import styles from "./Home.module.css";

export function DashboardOverview({
  overview,
}: {
  readonly overview: DashboardOverviewData;
}) {
  if (overview.metrics.length === 0 && overview.charts.length === 0) return null;

  return (
    <section className={styles.overview} aria-label="Operational overview">
      <div className={styles.overviewIntro}>
        <p className={styles.overviewLabel}>Operational overview</p>
        <p className={styles.overviewDescription}>
          Live counts from the work and organization records you can access.
        </p>
      </div>

      {overview.metrics.length > 0 ? (
        <dl className={styles.metrics}>
          {overview.metrics.map((metric) => (
            <div className={styles.metric} key={metric.id}>
              <dt className={styles.metricLabel}>{metric.label}</dt>
              <dd className={styles.metricValue}>{metric.value}</dd>
              <dd className={styles.metricContext}>{metric.context}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {overview.charts.length > 0 ? <DashboardCharts charts={overview.charts} /> : null}
    </section>
  );
}
