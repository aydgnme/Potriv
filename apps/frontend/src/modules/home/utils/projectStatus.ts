import type { StatusTone } from "@/shared/ui/StatusBadge";

import type { ProjectStatus } from "../model/homeData";

/**
 * Human wording and tone for a project status. Enum values are never shown raw,
 * and the tone is decided once here rather than in each component.
 */
const STATUS_LABELS: Readonly<Record<ProjectStatus, string>> = {
  NOT_STARTED: "Not started",
  STARTING: "Starting",
  IN_PROGRESS: "In progress",
  CLOSING: "Closing",
  CLOSED: "Closed",
};

const STATUS_TONES: Readonly<Record<ProjectStatus, StatusTone>> = {
  NOT_STARTED: "neutral",
  STARTING: "info",
  // The only one that reads as live work.
  IN_PROGRESS: "success",
  CLOSING: "warning",
  CLOSED: "neutral",
};

export function projectStatusLabel(status: ProjectStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export function projectStatusTone(status: ProjectStatus): StatusTone {
  return STATUS_TONES[status] ?? "neutral";
}
