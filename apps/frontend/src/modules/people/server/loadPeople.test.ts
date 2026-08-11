import { describe, expect, it, vi } from "vitest";

import type { AccessRole } from "@/shared/types/accessRole";

import {
  defaultView,
  grantedViews,
  hasPeopleCapability,
  normalizePeopleQuery,
  peopleHref,
} from "../model/peopleQuery";

import { loadPeople } from "./loadPeople";
import type { PeopleDataSources } from "./peopleDataSources";

/**
 * Which People question this session may ask, and which endpoints answer it.
 *
 * "Was the source called?" is the contract. The organization endpoints are
 * admin-only and the department ones answer for a manager's own department;
 * asking either on the wrong side would send the backend a request it rightly
 * refuses, on every page load.
 */

const OA: readonly AccessRole[] = ["EMPLOYEE", "ORGANIZATION_ADMIN"];
const DM: readonly AccessRole[] = ["EMPLOYEE", "DEPARTMENT_MANAGER"];
const BOTH: readonly AccessRole[] = ["EMPLOYEE", "ORGANIZATION_ADMIN", "DEPARTMENT_MANAGER"];

const DEPARTMENT = { departmentId: "dept-1", name: "Platform Engineering" };

function sources(overrides: Partial<PeopleDataSources> = {}) {
  return {
    getOrganizationUsers: vi.fn(async () => ({ ok: true as const, value: [] })),
    getOrganizationUser: vi.fn(async () => ({ ok: true as const, value: {} })),
    getManagedDepartment: vi.fn(async () => ({ ok: true as const, value: DEPARTMENT })),
    getDepartmentMembers: vi.fn(async () => ({ ok: true as const, value: [] })),
    getUnassignedEmployees: vi.fn(async () => ({ ok: true as const, value: [] })),
    ...overrides,
  } as unknown as PeopleDataSources & Record<string, ReturnType<typeof vi.fn>>;
}

describe("view entitlement", () => {
  it("gives an organization admin the organization view only", () => {
    expect(grantedViews(OA).map((scope) => scope.view)).toEqual(["organization"]);
  });

  it("gives a department manager their department view only", () => {
    expect(grantedViews(DM).map((scope) => scope.view)).toEqual(["department"]);
  });

  it("gives both, organization first, to someone holding both roles", () => {
    expect(grantedViews(BOTH).map((scope) => scope.view)).toEqual([
      "organization",
      "department",
    ]);
  });

  it("gives nothing to anyone else", () => {
    expect(grantedViews(["EMPLOYEE"])).toEqual([]);
    expect(grantedViews(["EMPLOYEE", "PROJECT_MANAGER"])).toEqual([]);
    expect(hasPeopleCapability(["EMPLOYEE", "PROJECT_MANAGER"])).toBe(false);
  });
});

describe("view normalization", () => {
  it("defaults to the widest view the roles grant", () => {
    expect(defaultView(OA)).toBe("organization");
    expect(defaultView(DM)).toBe("department");
    expect(defaultView(BOTH)).toBe("organization");
    expect(defaultView(["EMPLOYEE"])).toBeNull();
  });

  it("honours a view the roles grant", () => {
    expect(normalizePeopleQuery({ view: "department" }, BOTH)).toBe("department");
    expect(normalizePeopleQuery({ view: "organization" }, BOTH)).toBe("organization");
  });

  it("falls back when the view is not granted", () => {
    // An admin asking for the department view has no department to show.
    expect(normalizePeopleQuery({ view: "department" }, OA)).toBe("organization");
    expect(normalizePeopleQuery({ view: "organization" }, DM)).toBe("department");
  });

  it("falls back for anything that is not a view", () => {
    for (const view of ["banana", "", "ORGANIZATION", "../admin"]) {
      expect(normalizePeopleQuery({ view }, BOTH)).toBe("organization");
    }
  });

  it("takes the first value when the parameter is repeated", () => {
    expect(normalizePeopleQuery({ view: ["department", "organization"] }, BOTH)).toBe(
      "department",
    );
  });

  it("yields nothing for somebody with no People capability", () => {
    expect(normalizePeopleQuery({ view: "organization" }, ["EMPLOYEE"])).toBeNull();
  });

  it("leaves the default view out of the URL", () => {
    expect(peopleHref("organization")).toBe("/people");
    expect(peopleHref("department")).toBe("/people?view=department");
  });
});

describe("source gating", () => {
  it("loads only the organization list for the organization view", async () => {
    const deps = sources();

    await loadPeople("organization", deps);

    expect(deps.getOrganizationUsers).toHaveBeenCalledTimes(1);
    expect(deps.getManagedDepartment).not.toHaveBeenCalled();
    expect(deps.getDepartmentMembers).not.toHaveBeenCalled();
    expect(deps.getUnassignedEmployees).not.toHaveBeenCalled();
  });

  it("loads only the department sources for the department view", async () => {
    const deps = sources();

    await loadPeople("department", deps);

    expect(deps.getManagedDepartment).toHaveBeenCalledTimes(1);
    expect(deps.getOrganizationUsers).not.toHaveBeenCalled();
  });
});

describe("department context comes first", () => {
  it("resolves the department id from the backend, then uses that exact id", async () => {
    // The membership endpoints need an id, and the only place a manager's own id
    // comes from is the department-projects read — never the URL or a role name.
    const deps = sources();

    await loadPeople("department", deps);

    expect(deps.getDepartmentMembers).toHaveBeenCalledWith(DEPARTMENT.departmentId);
  });

  it("skips both lists when there is no managed department", async () => {
    const deps = sources({
      getManagedDepartment: vi.fn(async () => ({
        ok: false as const,
        reason: "FORBIDDEN" as const,
      })),
    });

    const data = await loadPeople("department", deps);

    if (data.view !== "department") throw new Error("expected department");
    expect(data.department).toEqual({ kind: "no-department", reason: "FORBIDDEN" });
    expect(deps.getDepartmentMembers).not.toHaveBeenCalled();
    expect(deps.getUnassignedEmployees).not.toHaveBeenCalled();
  });

  it("keeps an outage distinct from having no appointment", async () => {
    const deps = sources({
      getManagedDepartment: vi.fn(async () => ({ ok: false as const, reason: "ERROR" as const })),
    });

    const data = await loadPeople("department", deps);

    if (data.view !== "department") throw new Error("expected department");
    expect(data.department).toEqual({ kind: "no-department", reason: "ERROR" });
  });
});

describe("partial failure", () => {
  it("keeps the members when the unassigned pool fails", async () => {
    const deps = sources({
      getDepartmentMembers: vi.fn(async () => ({
        ok: true as const,
        value: [{ userId: "u1", name: "Ana", email: "a@x.test", accessRoles: [] }],
      })),
      getUnassignedEmployees: vi.fn(async () => ({
        ok: false as const,
        reason: "ERROR" as const,
      })),
    });

    const data = await loadPeople("department", deps);

    if (data.view !== "department" || data.department.kind !== "ready") {
      throw new Error("expected a ready department");
    }
    expect(data.department.members.ok).toBe(true);
    expect(data.department.unassigned.ok).toBe(false);
  });

  it("keeps the unassigned pool when the member list fails", async () => {
    const deps = sources({
      getDepartmentMembers: vi.fn(async () => ({ ok: false as const, reason: "ERROR" as const })),
      getUnassignedEmployees: vi.fn(async () => ({
        ok: true as const,
        value: [{ userId: "u2", name: "Bo", email: "b@x.test", accessRoles: [] }],
      })),
    });

    const data = await loadPeople("department", deps);

    if (data.view !== "department" || data.department.kind !== "ready") {
      throw new Error("expected a ready department");
    }
    expect(data.department.members.ok).toBe(false);
    expect(data.department.unassigned.ok).toBe(true);
  });
});
