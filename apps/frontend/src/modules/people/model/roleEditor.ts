import { PRODUCT_ACCESS_ROLES, type AccessRole } from "@/shared/types/accessRole";

import type { OrganizationUser } from "./peopleData";

/**
 * What an organization admin may change about somebody's access roles.
 *
 * Three backend rules shape this, and all three are re-derived here from data
 * rather than remembered from a previous screen:
 *
 * - **`EMPLOYEE` is the baseline.** The backend adds it to every organization
 *   role update, so the editor keeps it selected and locked. Letting someone
 *   untick it and watching it reappear would be a lie about what was saved.
 * - **You cannot change your own roles** — except for a founder alone in a new
 *   organization, who would otherwise be unable to set anything up. That
 *   exception is additive only and closes the moment a second person exists.
 * - **An organization always keeps one admin.** The last `ORGANIZATION_ADMIN`
 *   cannot have the role removed.
 *
 * `SYSTEM_ADMIN` is not part of this vocabulary at all. `PRODUCT_ACCESS_ROLES`
 * excludes it by construction, so the ordinary editor cannot render or submit it
 * even by accident.
 */

/** The four roles ordinary product administration knows about. */
export const PRODUCT_ROLES: readonly AccessRole[] = PRODUCT_ACCESS_ROLES;

/** Roles a founder alone in their organization may add to themselves. */
export const SELF_ASSIGNABLE_SETUP_ROLES: readonly AccessRole[] = [
  "DEPARTMENT_MANAGER",
  "PROJECT_MANAGER",
];

export type RoleOption = {
  readonly role: AccessRole;
  readonly selected: boolean;
  /** Cannot be changed, and the UI says why rather than merely dimming it. */
  readonly locked: boolean;
  readonly lockReason?: string;
};

export type RoleEditorState = {
  readonly options: readonly RoleOption[];
  /** False when nothing at all may be changed; the editor renders read-only. */
  readonly editable: boolean;
  /** Why the whole editor is read-only, where that is the case. */
  readonly readOnlyReason?: string;
  /** Extra context worth saying even when editing is possible. */
  readonly notice?: string;
};

export type RoleEditorInput = {
  readonly target: Pick<OrganizationUser, "userId" | "roles">;
  readonly currentUserId: string;
  /** Everyone in the organization, from a fresh read. Decides solo and last-admin. */
  readonly organizationUsers: readonly Pick<OrganizationUser, "userId" | "roles">[];
};

export function roleEditorState(input: RoleEditorInput): RoleEditorState {
  const current = new Set(input.target.roles);
  const isSelf = input.target.userId === input.currentUserId;
  const soloOrganization = input.organizationUsers.length === 1;
  const targetIsAdmin = current.has("ORGANIZATION_ADMIN");

  const adminCount = input.organizationUsers.filter((user) =>
    user.roles.includes("ORGANIZATION_ADMIN"),
  ).length;
  const isLastAdmin = targetIsAdmin && adminCount <= 1;

  // The founder exception: alone, and already the admin. Additive only.
  const soloBootstrap = isSelf && soloOrganization && targetIsAdmin;

  if (isSelf && !soloBootstrap) {
    return {
      editable: false,
      readOnlyReason:
        "You cannot change your own access roles. Another Organization Admin must do that.",
      options: PRODUCT_ROLES.map((role) => ({
        role,
        selected: current.has(role),
        locked: true,
      })),
    };
  }

  return {
    editable: true,
    notice: soloBootstrap
      ? "While you are the only person here you can add Department Manager or Project Manager to your own account, but not remove anything."
      : undefined,
    options: PRODUCT_ROLES.map((role) => {
      const selected = current.has(role);

      if (role === "EMPLOYEE") {
        return {
          role,
          selected: true,
          locked: true,
          lockReason: "Every organization user keeps Employee as the baseline access role.",
        };
      }

      // Setting yourself up: what you already have stays, and only these two may
      // be added.
      if (soloBootstrap) {
        if (selected) {
          return {
            role,
            selected,
            locked: true,
            lockReason: "You cannot remove your own roles while setting up your organization.",
          };
        }
        const addable = SELF_ASSIGNABLE_SETUP_ROLES.includes(role);
        return {
          role,
          selected,
          locked: !addable,
          lockReason: addable
            ? undefined
            : "You cannot give yourself this role while setting up your organization.",
        };
      }

      if (role === "ORGANIZATION_ADMIN" && isLastAdmin) {
        return {
          role,
          selected,
          locked: true,
          lockReason: "Every organization must keep at least one Organization Admin.",
        };
      }

      return { role, selected, locked: false };
    }),
  };
}

/**
 * The complete desired role set, as `PATCH /users/{id}/roles` expects it.
 *
 * `EMPLOYEE` is forced in and `SYSTEM_ADMIN` cannot survive, whatever arrived —
 * this runs on the server over form input, so it is a boundary, not a
 * convenience.
 */
export function toRolePayload(requested: readonly string[]): readonly AccessRole[] {
  const known = new Set<string>(PRODUCT_ROLES);
  const roles = new Set<AccessRole>(["EMPLOYEE"]);

  for (const role of requested) {
    if (known.has(role)) roles.add(role as AccessRole);
  }

  return [...roles];
}

/** Whether a submitted set is allowed, given the state the editor would have shown. */
export function validateRoleChange(
  state: RoleEditorState,
  requested: readonly AccessRole[],
): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  if (!state.editable) {
    return { ok: false, reason: state.readOnlyReason ?? "These roles cannot be changed." };
  }

  const wanted = new Set(requested);

  for (const option of state.options) {
    if (!option.locked) continue;
    // A locked option must come back exactly as it went out, whichever way it
    // was locked.
    if (wanted.has(option.role) !== option.selected) {
      return {
        ok: false,
        reason: option.lockReason ?? "One of those roles cannot be changed.",
      };
    }
  }

  return { ok: true };
}

/** Factual, and careful about what a role does *not* do. */
export const ROLE_DESCRIPTIONS: Readonly<Record<AccessRole, string>> = {
  EMPLOYEE: "Baseline access and employee workflows.",
  ORGANIZATION_ADMIN: "Manages people roles and organization structure.",
  DEPARTMENT_MANAGER:
    "Unlocks department-manager capabilities. It does not appoint the person to a department.",
  PROJECT_MANAGER:
    "Allows project-manager workflows. It does not transfer ownership of existing projects.",
};
