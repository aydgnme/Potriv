/**
 * The project lifecycle as the backend defines it (`ProjectStatus`).
 *
 * Lives in `shared` for the same reason `AccessRole` does: Home, Projects and
 * every later staffing surface render it, and none of them owns it. A copy per
 * module would be five places for the same enum to drift.
 */
export const PROJECT_STATUSES = [
  "NOT_STARTED",
  "STARTING",
  "IN_PROGRESS",
  "CLOSING",
  "CLOSED",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/**
 * Narrows a value that came from outside the type system — a URL query above all.
 *
 * Anything unrecognised is rejected rather than passed along, so a crafted
 * `?status=` can never reach a backend request.
 */
export function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === "string" && (PROJECT_STATUSES as readonly string[]).includes(value);
}
