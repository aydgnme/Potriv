import type { ProjectPeriod } from "../model/projectsData";

/**
 * How the project is scoped in time. `ONGOING` is not "late" and carries no
 * deadline of its own — the absence of an end date is the point, not a gap.
 */
const PERIOD_LABELS: Readonly<Record<ProjectPeriod, string>> = {
  FIXED: "Fixed",
  ONGOING: "Ongoing",
};

export function projectPeriodLabel(period: ProjectPeriod): string {
  return PERIOD_LABELS[period] ?? period;
}
