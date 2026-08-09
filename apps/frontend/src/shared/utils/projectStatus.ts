import type { StatusTone } from "@/shared/ui/StatusBadge";
import type { ProjectStatus } from "@/shared/types/projectStatus";

/**
 * Human wording and tone for a project status. Enum values are never shown raw,
 * and the tone is decided once here rather than in each component, so the same
 * status cannot read as "live work" on one screen and neutral on the next.
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

/**
 * How much a status wants attention today. Live work first, finished work last.
 *
 * Deterministic and total, so a list sorted by it renders the same way twice.
 */
const ATTENTION_ORDER: readonly ProjectStatus[] = [
  "IN_PROGRESS",
  "STARTING",
  "CLOSING",
  "NOT_STARTED",
  "CLOSED",
];

export function projectAttentionRank(status: ProjectStatus): number {
  const index = ATTENTION_ORDER.indexOf(status);
  return index === -1 ? ATTENTION_ORDER.length : index;
}
