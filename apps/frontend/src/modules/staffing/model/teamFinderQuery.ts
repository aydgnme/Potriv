/**
 * Team Finder criteria, as the URL carries them.
 *
 * The backend endpoint is a `POST` that reads: it persists nothing and changes
 * no project, but it also cannot be bookmarked. So the criteria live in the
 * address instead — back, forward, reload and a shared link all reconstruct the
 * same search by re-posting it.
 *
 * Everything here is pure, and nothing leaves it that the backend would reject.
 * A value outside the ranges the service enforces is dropped rather than passed
 * on, because sending it would turn a mistyped URL into a 400 the person cannot
 * act on.
 */

export type TeamFinderCriteriaInput = {
  readonly includePartiallyAvailable: boolean;
  readonly includeCloseToFinish: boolean;
  /** Only meaningful when close-to-finish is on; omitted otherwise. */
  readonly closeToFinishWeeks: number | null;
  readonly includeUnavailable: boolean;
  /** Null means "let the backend apply its own default". */
  readonly limit: number | null;
};

/** The body `POST /projects/{id}/team-finder` accepts. Optional fields are omitted. */
export type TeamFinderRequestBody = {
  readonly includePartiallyAvailable?: boolean;
  readonly includeCloseToFinish?: boolean;
  readonly closeToFinishWeeks?: number;
  readonly includeUnavailable?: boolean;
  readonly limit?: number;
};

/** Ranges the service validates. Outside them it answers 400, so nothing outside them is sent. */
export const CLOSE_TO_FINISH_WEEKS_RANGE = { min: 2, max: 6 } as const;
export const LIMIT_RANGE = { min: 1, max: 100 } as const;

export type RawSearchParams = Readonly<Record<string, string | readonly string[] | undefined>>;

export function normalizeTeamFinderQuery(params: RawSearchParams): TeamFinderCriteriaInput {
  const includeCloseToFinish = readBoolean(params.includeCloseToFinish);

  return {
    includePartiallyAvailable: readBoolean(params.includePartiallyAvailable),
    includeCloseToFinish,
    // A window is meaningless when the flag is off, and an out-of-range one is
    // dropped so the backend applies its own default rather than refusing.
    closeToFinishWeeks: includeCloseToFinish
      ? readBoundedInteger(params.closeToFinishWeeks, CLOSE_TO_FINISH_WEEKS_RANGE)
      : null,
    includeUnavailable: readBoolean(params.includeUnavailable),
    limit: readBoundedInteger(params.limit, LIMIT_RANGE),
  };
}

/**
 * Only what was actually asked for.
 *
 * A flag left false and a missing limit are omitted entirely rather than sent as
 * `false`/`null`, so the response's echoed criteria show the backend's own
 * defaults instead of ours.
 */
export function toRequestBody(criteria: TeamFinderCriteriaInput): TeamFinderRequestBody {
  return {
    ...(criteria.includePartiallyAvailable ? { includePartiallyAvailable: true } : {}),
    ...(criteria.includeCloseToFinish ? { includeCloseToFinish: true } : {}),
    ...(criteria.includeCloseToFinish && criteria.closeToFinishWeeks !== null
      ? { closeToFinishWeeks: criteria.closeToFinishWeeks }
      : {}),
    ...(criteria.includeUnavailable ? { includeUnavailable: true } : {}),
    ...(criteria.limit !== null ? { limit: criteria.limit } : {}),
  };
}

/** The canonical URL for a set of criteria, carrying only what differs from the defaults. */
export function teamFinderHref(
  projectId: string,
  criteria: TeamFinderCriteriaInput,
): string {
  const search = new URLSearchParams();
  if (criteria.includePartiallyAvailable) search.set("includePartiallyAvailable", "true");
  if (criteria.includeCloseToFinish) {
    search.set("includeCloseToFinish", "true");
    if (criteria.closeToFinishWeeks !== null) {
      search.set("closeToFinishWeeks", String(criteria.closeToFinishWeeks));
    }
  }
  if (criteria.includeUnavailable) search.set("includeUnavailable", "true");
  if (criteria.limit !== null) search.set("limit", String(criteria.limit));

  const query = search.toString();
  return query ? `/projects/${projectId}/team-finder?${query}` : `/projects/${projectId}/team-finder`;
}

function firstValue(value: string | readonly string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : (value as string | undefined);
}

/** Only the literal "true" turns a flag on; anything else is the default, off. */
function readBoolean(value: string | readonly string[] | undefined): boolean {
  return firstValue(value) === "true";
}

function readBoundedInteger(
  value: string | readonly string[] | undefined,
  range: { readonly min: number; readonly max: number },
): number | null {
  const raw = firstValue(value);
  if (raw === undefined || raw.trim() === "") return null;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < range.min || parsed > range.max) return null;

  return parsed;
}
