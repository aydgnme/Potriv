/**
 * A readable, deterministic date. No library for this — one `Intl` call is
 * enough, and a dependency would be more code than the problem.
 *
 * Fixed to UTC so the string does not shift between the server render and the
 * browser, which would trip React's hydration check. Backend dates are plain
 * `LocalDate` (`YYYY-MM-DD`) with no timezone of their own, so interpreting them
 * anywhere else would be inventing one.
 */
const FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDate(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null;
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return null;
  return FORMATTER.format(parsed);
}

/**
 * The span a project runs for, as one readable phrase.
 *
 * An ongoing project legitimately has no deadline, so the missing end is stated
 * rather than filled in — `Invalid date` or an invented date would both be
 * claims the backend never made.
 */
export function formatDateRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): string {
  const start = formatDate(startDate);
  const end = formatDate(endDate);

  if (start && end) return `${start} – ${end}`;
  if (start) return `${start} – no deadline`;
  if (end) return `Until ${end}`;
  return "No dates set";
}
