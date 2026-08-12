import type { SkillCategory } from "./skillsData";

/**
 * The catalogue's filters, kept in the URL and normalized before anything is
 * fetched.
 *
 * Filters live in the URL because a filtered catalogue is a thing people send to
 * each other and reach for the back button on. The normalization matters more
 * than it looks: the screen must never claim one filter while asking the backend
 * for another, so a category the organization does not have becomes "all
 * categories" *in the URL sense too*, not a silent parameter nobody can see.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RawSearchParams = Record<string, string | readonly string[] | undefined>;

export type CatalogueQuery = {
  /** Trimmed; absent rather than blank, because the backend treats blank as "all". */
  readonly q?: string;
  /** Only ever a category this organization actually has, under the current mode. */
  readonly categoryId?: string;
  readonly includeInactive: boolean;
};

function firstValue(raw: RawSearchParams[string]): string | undefined {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw[0];
  return undefined;
}

/**
 * The half of normalization that needs no data.
 *
 * Split out because the category list has to be fetched with the *effective*
 * `includeInactive`, which means that flag must be settled first — otherwise the
 * filter would offer inactive categories that the source was never asked for.
 */
export function readCatalogueMode(params: RawSearchParams): {
  readonly q?: string;
  readonly requestedCategoryId?: string;
  readonly includeInactive: boolean;
} {
  const rawQ = firstValue(params.q)?.trim();
  const rawCategory = firstValue(params.categoryId);

  return {
    ...(rawQ ? { q: rawQ } : {}),
    // Only the literal string counts; `?includeInactive=banana` is not a request
    // to widen what somebody can see.
    includeInactive: firstValue(params.includeInactive) === "true",
    // Syntax first: a malformed id must not reach a backend query at all.
    ...(rawCategory && UUID.test(rawCategory) ? { requestedCategoryId: rawCategory } : {}),
  };
}

/**
 * Settle the category against what the organization actually has.
 *
 * A well-formed id for a category that does not exist — or one that is inactive
 * while the toggle is off — collapses to no category filter. The alternative is a
 * screen showing "All categories" while quietly filtering by something.
 */
export function normalizeCatalogueQuery(
  params: RawSearchParams,
  categories: readonly SkillCategory[],
): CatalogueQuery {
  const mode = readCatalogueMode(params);

  const known =
    mode.requestedCategoryId !== undefined &&
    categories.some((category) => category.categoryId === mode.requestedCategoryId);

  return {
    ...(mode.q ? { q: mode.q } : {}),
    ...(known ? { categoryId: mode.requestedCategoryId } : {}),
    includeInactive: mode.includeInactive,
  };
}

/** Whether any filter is narrowing the list, which decides the empty state. */
export function isFiltered(query: CatalogueQuery): boolean {
  return query.q !== undefined || query.categoryId !== undefined;
}

/**
 * A catalogue URL built from settled values only.
 *
 * `includeInactive` is carried explicitly when on so the toggle survives every
 * link, and omitted when off so the default URL stays clean.
 */
export function catalogueHref(query: Partial<CatalogueQuery>): string {
  const search = new URLSearchParams();

  if (query.q) search.set("q", query.q);
  if (query.categoryId) search.set("categoryId", query.categoryId);
  if (query.includeInactive) search.set("includeInactive", "true");

  const suffix = search.toString();
  return suffix ? `/skills?${suffix}` : "/skills";
}
