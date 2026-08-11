import "server-only";

import type { DepartmentUser, ManagedDepartment, OrganizationUser } from "../model/peopleData";
import type { PeopleView } from "../model/peopleQuery";
import {
  PEOPLE_DATA_SOURCES,
  type Loaded,
  type LoadFailure,
  type PeopleDataSources,
} from "./peopleDataSources";

/**
 * What each People view loads.
 *
 * Only the active view's sources are called. Holding both roles does not mean
 * both questions are being asked, and prefetching the other one would pay for
 * data nobody is looking at.
 */

export type PeopleData =
  | { readonly view: "organization"; readonly users: Loaded<readonly OrganizationUser[]> }
  | { readonly view: "department"; readonly department: DepartmentData };

/**
 * The department view, in the order it has to be loaded.
 *
 * The membership endpoints need an exact department id, and the only place a
 * manager's own id comes from is `GET /department/projects` — never the URL,
 * never a role name. So the context is resolved first, and the two lists are
 * fetched together only once there is an id to fetch them with.
 */
export type DepartmentData =
  | { readonly kind: "no-department"; readonly reason: LoadFailure }
  | {
      readonly kind: "ready";
      readonly department: ManagedDepartment;
      /** Independent of each other: one failing must not blank the other. */
      readonly members: Loaded<readonly DepartmentUser[]>;
      readonly unassigned: Loaded<readonly DepartmentUser[]>;
    };

export async function loadPeople(
  view: PeopleView,
  sources: PeopleDataSources = PEOPLE_DATA_SOURCES,
): Promise<PeopleData> {
  if (view === "organization") {
    return { view: "organization", users: await sources.getOrganizationUsers() };
  }

  return { view: "department", department: await loadDepartment(sources) };
}

async function loadDepartment(sources: PeopleDataSources): Promise<DepartmentData> {
  const department = await sources.getManagedDepartment();
  if (!department.ok) {
    // 403 here means the role without the appointment — a setup state, not an
    // outage. Nothing membership-related is called without a real id.
    return { kind: "no-department", reason: department.reason };
  }

  const [members, unassigned] = await Promise.all([
    sources.getDepartmentMembers(department.value.departmentId),
    sources.getUnassignedEmployees(),
  ]);

  return { kind: "ready", department: department.value, members, unassigned };
}
