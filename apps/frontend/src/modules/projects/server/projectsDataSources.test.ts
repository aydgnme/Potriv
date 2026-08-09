import { beforeEach, describe, expect, it, vi } from "vitest";

const backendGet = vi.fn();

vi.mock("@/modules/auth/server-public", () => ({
  backendGet,
  BackendRequestError: class {},
}));

const {
  getDepartmentProjects,
  getManagedProjects,
  getMyProjects,
  getProjectStaffingDetails,
} = await import("./projectsDataSources");

/**
 * The exact path each scope asks the backend for.
 *
 * The status filter is the only place a URL value reaches a request, so what is
 * appended — and what is not — is pinned here rather than inferred from the
 * rendered page.
 */

beforeEach(() => {
  backendGet.mockReset();
  backendGet.mockResolvedValue({ ok: true, value: [] });
});

function requestedPath(): string {
  expect(backendGet).toHaveBeenCalledTimes(1);
  return backendGet.mock.calls[0]![0] as string;
}

describe("backend paths", () => {
  it("asks for managed projects with a status", async () => {
    await getManagedProjects("IN_PROGRESS");

    expect(requestedPath()).toBe("/projects/managed?status=IN_PROGRESS");
  });

  it("omits the parameter entirely for All statuses", async () => {
    // Not `?status=`, not `?status=null` — the parameter is simply absent.
    await getManagedProjects(null);

    expect(requestedPath()).toBe("/projects/managed");
  });

  it("asks for department projects with a status", async () => {
    await getDepartmentProjects("CLOSED");

    expect(requestedPath()).toBe("/department/projects?status=CLOSED");
  });

  it("omits the parameter for department projects with All statuses", async () => {
    await getDepartmentProjects(null);

    expect(requestedPath()).toBe("/department/projects");
  });

  it("never sends a status to the allocation history, which has no such parameter", async () => {
    await getMyProjects();

    expect(requestedPath()).toBe("/me/projects");
  });

  it("asks for one project's details by id", async () => {
    await getProjectStaffingDetails("3f2a-1");

    expect(requestedPath()).toBe("/projects/3f2a-1/details");
  });
});

describe("failure classification", () => {
  it("reports 403 as an authority state, not an outage", async () => {
    // A department manager with no department is refused, and that is a fact
    // about authority rather than something being broken.
    backendGet.mockResolvedValue({ ok: false, error: { status: 403 } });

    await expect(getDepartmentProjects(null)).resolves.toEqual({
      ok: false,
      reason: "FORBIDDEN",
    });
  });

  it("reports anything else as an error", async () => {
    for (const status of [0, 404, 500, 503]) {
      backendGet.mockResolvedValue({ ok: false, error: { status } });

      await expect(getDepartmentProjects(null)).resolves.toEqual({
        ok: false,
        reason: "ERROR",
      });
    }
  });
});
