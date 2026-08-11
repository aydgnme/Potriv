import type { AccessRole } from "@/shared/types/accessRole";

/**
 * Which People question is being asked, expressed in the URL.
 *
 * Not a role switcher: the two views are different questions with different
 * backing endpoints, and which of them somebody may ask follows from their
 * roles. A `?view=` they are not entitled to falls back to one they are, before
 * any privileged request is made — firing it and reading the refusal would make
 * capability depend on error handling.
 */

export type PeopleView = "organization" | "department";

export type PeopleScope = {
  readonly view: PeopleView;
  readonly label: string;
};

const SCOPES: readonly (PeopleScope & { readonly revealedBy: AccessRole })[] = [
  { view: "organization", label: "Organization", revealedBy: "ORGANIZATION_ADMIN" },
  { view: "department", label: "My department", revealedBy: "DEPARTMENT_MANAGER" },
];

export type RawSearchParams = Readonly<Record<string, string | readonly string[] | undefined>>;

/** The views a role set grants, in display order. Union, never intersection. */
export function grantedViews(roles: readonly AccessRole[]): readonly PeopleScope[] {
  const held = new Set<AccessRole>(roles);

  return SCOPES.filter((scope) => held.has(scope.revealedBy)).map(({ view, label }) => ({
    view,
    label,
  }));
}

export function hasPeopleCapability(roles: readonly AccessRole[]): boolean {
  return grantedViews(roles).length > 0;
}

/**
 * Organization first where both are held: it is the wider question, and the one
 * an organization admin most likely came for.
 */
export function defaultView(roles: readonly AccessRole[]): PeopleView | null {
  return grantedViews(roles)[0]?.view ?? null;
}

export function normalizePeopleQuery(
  params: RawSearchParams,
  roles: readonly AccessRole[],
): PeopleView | null {
  const raw = Array.isArray(params.view) ? params.view[0] : (params.view as string | undefined);
  const granted = grantedViews(roles);

  const requested = granted.find((scope) => scope.view === raw);
  return requested?.view ?? defaultView(roles);
}

export function peopleHref(view: PeopleView): string {
  return view === "organization" ? "/people" : `/people?view=${view}`;
}
