import "server-only";

import type { Department, OrganizationInvite } from "../model/organizationData";
import { managerChoices, type ManagerChoices } from "../model/managerChoices";

import {
  getDepartment,
  getDepartments,
  getOrganizationInvite,
  getOrganizationMembers,
  type Loaded,
} from "./organizationDataSources";

/**
 * What each Organization screen needs, and nothing more.
 *
 * The landing page asks two unrelated questions — how the departments stand, and
 * whether an invite link exists — so they are fetched together but reported
 * separately. One outage does not blank the other section.
 */

export type OrganizationOverview = {
  readonly departments: Loaded<readonly Department[]>;
  readonly invite: InviteState;
};

/**
 * A missing invite is not a failure.
 *
 * `GET /organizations/current/invite` answers 404 when none is active, which is
 * an ordinary state with an obvious next step, not an error to apologise for.
 */
export type InviteState =
  | { readonly kind: "ready"; readonly invite: OrganizationInvite }
  | { readonly kind: "none" }
  | { readonly kind: "error" };

async function loadInvite(): Promise<InviteState> {
  const outcome = await getOrganizationInvite();
  if (outcome.ok) return { kind: "ready", invite: outcome.value };
  if (outcome.reason === "NOT_FOUND") return { kind: "none" };
  return { kind: "error" };
}

export async function loadOrganizationOverview(): Promise<OrganizationOverview> {
  const [departments, invite] = await Promise.all([getDepartments(), loadInvite()]);
  return { departments, invite };
}

export function loadInviteState(): Promise<InviteState> {
  return loadInvite();
}

export function loadDepartments(): Promise<Loaded<readonly Department[]>> {
  return getDepartments();
}

export type DepartmentDetail = {
  readonly department: Department;
  /**
   * Who could manage it, or why nobody can be offered.
   *
   * Absent when the people or department lists could not be read — the detail
   * itself is still worth showing, and an empty picker would wrongly read as
   * "nobody is eligible".
   */
  readonly managers: ManagerChoices | null;
};

export type DepartmentDetailState =
  | { readonly kind: "ready"; readonly detail: DepartmentDetail }
  | { readonly kind: "unavailable" }
  | { readonly kind: "error" };

/**
 * One department, plus the choices for its manager.
 *
 * 403 and 404 collapse into one `unavailable` state. Distinguishing them would
 * answer "does this id exist?" for anyone willing to try ids.
 */
export async function loadDepartmentDetail(
  departmentId: string,
): Promise<DepartmentDetailState> {
  const department = await getDepartment(departmentId);

  if (!department.ok) {
    if (department.reason === "ERROR") return { kind: "error" };
    return { kind: "unavailable" };
  }

  const [users, departments] = await Promise.all([getOrganizationMembers(), getDepartments()]);

  const managers =
    users.ok && departments.ok
      ? managerChoices({ departmentId, users: users.value, departments: departments.value })
      : null;

  return { kind: "ready", detail: { department: department.value, managers } };
}
