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
