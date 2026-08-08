/**
 * Roles as the product frontend understands them.
 *
 * `SYSTEM_ADMIN` is deliberately absent. It exists in the backend and has its
 * own server-rendered console; the product UI must never surface its controls,
 * so it is not part of this union and cannot be navigated to by construction.
 */
export const PRODUCT_ACCESS_ROLES = [
  "EMPLOYEE",
  "PROJECT_MANAGER",
  "DEPARTMENT_MANAGER",
  "ORGANIZATION_ADMIN",
] as const;

export type AccessRole = (typeof PRODUCT_ACCESS_ROLES)[number];

const ROLE_LABELS: Readonly<Record<AccessRole, string>> = {
  EMPLOYEE: "Employee",
  PROJECT_MANAGER: "Project manager",
  DEPARTMENT_MANAGER: "Department manager",
  ORGANIZATION_ADMIN: "Organization admin",
};

/** Sentence case for people. Enum values are never shown raw. */
export function roleLabel(role: AccessRole): string {
  return ROLE_LABELS[role];
}

/**
 * Narrows whatever the server sent. The API can legitimately return roles this
 * union does not model — `SYSTEM_ADMIN` above all — so unknown values are
 * dropped rather than trusted, and the caller gets only roles the product can
 * actually represent.
 */
export function toProductRoles(values: readonly unknown[]): readonly AccessRole[] {
  const known = new Set<string>(PRODUCT_ACCESS_ROLES);
  const kept: AccessRole[] = [];

  for (const value of values) {
    if (typeof value === "string" && known.has(value) && !kept.includes(value as AccessRole)) {
      kept.push(value as AccessRole);
    }
  }
  return kept;
}
