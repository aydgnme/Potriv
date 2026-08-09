import type { AccessRole } from "@/shared/types/accessRole";
import { type ProjectStatus, isProjectStatus } from "@/shared/types/projectStatus";

/**
 * What the Projects screen is showing, expressed entirely in the URL.
 *
 * A scope is a **data scope**, not a role mode. The backend authorises against
 * the whole role set on every request, so a UI that claimed to switch role would
 * constrain nothing while appearing to. What genuinely differs is which question
 * is being asked:
 *
 * - `managed`    — projects I manage
 * - `department` — projects my managed department has active allocations on
 * - `mine`       — projects I personally have or have had an allocation on
 *
 * The same project can legitimately appear in more than one of these, meaning
 * something different each time, so they are never merged into one row.
 */
export type ProjectsView = "managed" | "department" | "mine";

/** Null is "All statuses", not a missing value. */
export type ProjectStatusFilter = ProjectStatus | null;

export type ProjectsQuery = {
  readonly view: ProjectsView;
  readonly status: ProjectStatusFilter;
};

export type ProjectsScope = {
  readonly view: ProjectsView;
  readonly label: string;
};

/**
 * Fixed presentation order, widest authority first. Declared as data so the nav
 * cannot drift from the entitlement rule.
 */
const SCOPES: readonly (ProjectsScope & { readonly revealedBy: AccessRole | null })[] = [
  { view: "managed", label: "Managed", revealedBy: "PROJECT_MANAGER" },
  { view: "department", label: "Department", revealedBy: "DEPARTMENT_MANAGER" },
  // Every authenticated product user has an allocation history, even an empty one.
  { view: "mine", label: "My projects", revealedBy: null },
];

/**
 * The scopes a role set grants, in display order.
 *
 * Union, never intersection: holding more roles can only add scopes. An
 * organization admin gains nothing here — the backend has no organization-wide
 * project list, and inventing one would be a screen with no data behind it.
 */
export function grantedScopes(roles: readonly AccessRole[]): readonly ProjectsScope[] {
  const held = new Set<AccessRole>(roles);

  return SCOPES.filter((scope) => scope.revealedBy === null || held.has(scope.revealedBy)).map(
    ({ view, label }) => ({ view, label }),
  );
}

/**
 * Which scope opens by default: the one carrying the most responsibility for
 * other people's work, falling back to one's own.
 */
export function defaultView(roles: readonly AccessRole[]): ProjectsView {
  if (roles.includes("PROJECT_MANAGER")) return "managed";
  if (roles.includes("DEPARTMENT_MANAGER")) return "department";
  return "mine";
}

export function isViewGranted(view: ProjectsView, roles: readonly AccessRole[]): boolean {
  return grantedScopes(roles).some((scope) => scope.view === view);
}

/** Whatever `searchParams` hands over — values may be absent, repeated or invented. */
export type RawSearchParams = Readonly<Record<string, string | readonly string[] | undefined>>;

/**
 * Turns a URL into a query the loader can trust.
 *
 * Everything is validated against a closed union before it can influence a
 * request. A `?view=` the roles do not grant falls back to the default granted
 * scope rather than being attempted — firing the request and reading the 403 as
 * "not allowed" would make capability depend on error handling and would send
 * the backend a request it rightly refuses on every page load.
 *
 * An unrecognised `?status=` becomes All rather than an error: it is a filter,
 * and the honest response to a filter nobody can parse is to filter nothing.
 */
export function normalizeProjectsQuery(
  params: RawSearchParams,
  roles: readonly AccessRole[],
): ProjectsQuery {
  const requestedView = firstValue(params.view);
  const view =
    isProjectsView(requestedView) && isViewGranted(requestedView, roles)
      ? requestedView
      : defaultView(roles);

  const requestedStatus = firstValue(params.status);

  return { view, status: isProjectStatus(requestedStatus) ? requestedStatus : null };
}

function isProjectsView(value: string | undefined): value is ProjectsView {
  return value === "managed" || value === "department" || value === "mine";
}

/** A repeated query parameter is a single value as far as this screen is concerned. */
function firstValue(value: string | readonly string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : (value as string | undefined);
}

/**
 * The href for a scope, carrying the current status filter across.
 *
 * Changing scope should not silently reset what someone was looking for.
 */
export function projectsHref(query: ProjectsQuery): string {
  const search = new URLSearchParams({ view: query.view });
  if (query.status) search.set("status", query.status);
  return `/projects?${search.toString()}`;
}
