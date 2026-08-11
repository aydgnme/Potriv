import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_DEPARTMENT_STATE } from "../../model/organizationActionState";

/**
 * Department lifecycle, from the outside.
 *
 * The delete path carries the weight here. What the browser believed about a
 * department's manager or member count is never consulted: the department is
 * re-read, and the two blockers this product can see are re-derived from that
 * read. Passing them is still not a promise, because other modules hold
 * dependencies nothing here can enumerate.
 */

const resolveProductSession = vi.fn();
const getDepartment = vi.fn();
const createDepartment = vi.fn();
const updateDepartment = vi.fn();
const deleteDepartment = vi.fn();
const revalidatePath = vi.fn();
const redirect = vi.fn();

vi.mock("@/modules/auth/server/productSession", () => ({ resolveProductSession }));
vi.mock("../organizationDataSources", () => ({
  getDepartment,
  createDepartment,
  updateDepartment,
  deleteDepartment,
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({
  // The real one signals by throwing, and the action must not catch it.
  redirect: (path: string) => {
    redirect(path);
    throw new Error("NEXT_REDIRECT");
  },
}));

const { createDepartmentAction, updateDepartmentAction, deleteDepartmentAction } = await import(
  "./departmentActions"
);

const DEPARTMENT = "3e38e3cc-140c-4b89-a51d-a184c6e85700";

function department(overrides: Record<string, unknown> = {}) {
  return {
    departmentId: DEPARTMENT,
    name: "Platform",
    manager: null,
    memberCount: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    ...overrides,
  };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveProductSession.mockResolvedValue({
    authenticated: true,
    user: { userId: "oa-1", roles: ["EMPLOYEE", "ORGANIZATION_ADMIN"] },
  });
  getDepartment.mockResolvedValue({ ok: true, value: department() });
  createDepartment.mockResolvedValue({ ok: true, value: department() });
  updateDepartment.mockResolvedValue({ ok: true, value: department() });
  deleteDepartment.mockResolvedValue({ ok: true, value: undefined });
});

describe("creating a department", () => {
  it("sends the trimmed name and nothing else", async () => {
    await createDepartmentAction(EMPTY_DEPARTMENT_STATE, form({ name: "  Platform  " }));

    expect(createDepartment).toHaveBeenCalledWith("Platform");
    expect(createDepartment.mock.calls[0]).toHaveLength(1);
  });

  it("preserves the case that was typed", async () => {
    await createDepartmentAction(EMPTY_DEPARTMENT_STATE, form({ name: "PLATFORM" }));

    expect(createDepartment).toHaveBeenCalledWith("PLATFORM");
  });

  it("refuses a blank name without asking the backend", async () => {
    const state = await createDepartmentAction(EMPTY_DEPARTMENT_STATE, form({ name: "   " }));

    expect(createDepartment).not.toHaveBeenCalled();
    expect(state.fieldErrors?.name).toBeDefined();
  });

  it("refuses a name past 160 characters", async () => {
    const state = await createDepartmentAction(
      EMPTY_DEPARTMENT_STATE,
      form({ name: "x".repeat(161) }),
    );

    expect(createDepartment).not.toHaveBeenCalled();
    expect(state.fieldErrors?.name).toBeDefined();
  });

  it("keeps the entered value when the name is already taken", async () => {
    createDepartment.mockResolvedValue({
      ok: false,
      status: 409,
      detail: "A department with this name already exists in the organization.",
    });

    const state = await createDepartmentAction(EMPTY_DEPARTMENT_STATE, form({ name: "platform" }));

    expect(state.error).toContain("already exists");
    expect(state.name).toBe("platform");
    expect(state.done).toBeUndefined();
  });

  it("refreshes the organization and Home", async () => {
    await createDepartmentAction(EMPTY_DEPARTMENT_STATE, form({ name: "Platform" }));

    for (const path of ["/organization", "/organization/departments", "/home"]) {
      expect(revalidatePath).toHaveBeenCalledWith(path);
    }
  });
});

describe("renaming a department", () => {
  it("sends only the name", async () => {
    await updateDepartmentAction(
      EMPTY_DEPARTMENT_STATE,
      form({ departmentId: DEPARTMENT, name: "  Platform Engineering  " }),
    );

    expect(updateDepartment).toHaveBeenCalledWith(DEPARTMENT, "Platform Engineering");
    expect(updateDepartment.mock.calls[0]).toHaveLength(2);
  });

  it("refuses anything that is not an identifier", async () => {
    for (const departmentId of ["", "../departments", "not-a-uuid"]) {
      vi.clearAllMocks();
      await updateDepartmentAction(
        EMPTY_DEPARTMENT_STATE,
        form({ departmentId, name: "Platform" }),
      );
      expect(updateDepartment).not.toHaveBeenCalled();
    }
  });

  it("keeps the entered value on a duplicate", async () => {
    updateDepartment.mockResolvedValue({
      ok: false,
      status: 409,
      detail: "A department with this name already exists in the organization.",
    });

    const state = await updateDepartmentAction(
      EMPTY_DEPARTMENT_STATE,
      form({ departmentId: DEPARTMENT, name: "QA" }),
    );

    expect(state.name).toBe("QA");
  });
});

describe("deleting a department", () => {
  it("refuses when the fresh read still shows a manager", async () => {
    // The page may have rendered before somebody was appointed.
    getDepartment.mockResolvedValue({
      ok: true,
      value: department({ manager: { userId: "u-ana", name: "Ana", email: "ana@potriv.test" } }),
    });

    const state = await deleteDepartmentAction(
      EMPTY_DEPARTMENT_STATE,
      form({ departmentId: DEPARTMENT }),
    );

    expect(deleteDepartment).not.toHaveBeenCalled();
    expect(state.error).toContain("Ana");
  });

  it("refuses when the fresh read still shows members", async () => {
    getDepartment.mockResolvedValue({ ok: true, value: department({ memberCount: 3 }) });

    const state = await deleteDepartmentAction(
      EMPTY_DEPARTMENT_STATE,
      form({ departmentId: DEPARTMENT }),
    );

    expect(deleteDepartment).not.toHaveBeenCalled();
    expect(state.error).toContain("3 people");
  });

  it("never clears the blockers on the caller's behalf", async () => {
    getDepartment.mockResolvedValue({
      ok: true,
      value: department({
        manager: { userId: "u-ana", name: "Ana", email: "ana@potriv.test" },
        memberCount: 2,
      }),
    });

    await deleteDepartmentAction(EMPTY_DEPARTMENT_STATE, form({ departmentId: DEPARTMENT }));

    // No cascade: the module exposes no manager or membership mutation at all.
    expect(deleteDepartment).not.toHaveBeenCalled();
  });

  it("deletes a department with no known blocker, and leaves the dead route", async () => {
    // Staying would render this department's own detail page for a department
    // that no longer exists — and its honest "does not exist or is not visible
    // to you" is the right sentence for a stale URL, not for a delete somebody
    // just performed on purpose.
    await expect(
      deleteDepartmentAction(EMPTY_DEPARTMENT_STATE, form({ departmentId: DEPARTMENT })),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(deleteDepartment).toHaveBeenCalledWith(DEPARTMENT);
    expect(redirect).toHaveBeenCalledWith("/organization/departments");
  });

  it("refreshes the organization before it goes", async () => {
    await expect(
      deleteDepartmentAction(EMPTY_DEPARTMENT_STATE, form({ departmentId: DEPARTMENT })),
    ).rejects.toThrow("NEXT_REDIRECT");

    for (const path of ["/organization", "/organization/departments", "/home"]) {
      expect(revalidatePath).toHaveBeenCalledWith(path);
    }
  });

  it("reports a backend refusal it could not have predicted", async () => {
    // Linked skills, for instance: no product endpoint exposes them, so the
    // frontend must not claim deletion was guaranteed.
    deleteDepartment.mockResolvedValue({
      ok: false,
      status: 409,
      detail: "Department has linked skills and cannot be deleted.",
    });

    const state = await deleteDepartmentAction(
      EMPTY_DEPARTMENT_STATE,
      form({ departmentId: DEPARTMENT }),
    );

    expect(state.error).toContain("linked skills");
    expect(state.done).toBeUndefined();
  });

  it("gives one sentence for a department that is missing or not visible", async () => {
    for (const reason of ["NOT_FOUND", "FORBIDDEN"]) {
      getDepartment.mockResolvedValue({ ok: false, reason });

      const state = await deleteDepartmentAction(
        EMPTY_DEPARTMENT_STATE,
        form({ departmentId: DEPARTMENT }),
      );

      expect(state.error).toBe("This department does not exist or is not visible to you.");
    }
  });
});

describe("only a real deletion leaves the page", () => {
  /**
   * Every way this can fail keeps somebody on the detail route, where the error
   * and the department are both still in front of them. Navigating away from a
   * refusal would hide the reason and imply the delete had worked.
   */
  async function expectStays(state: Promise<{ readonly error?: string }>) {
    const settled = await state;
    expect(redirect).not.toHaveBeenCalled();
    expect(settled.error).toBeDefined();
    return settled;
  }

  it("stays on a fresh manager blocker", async () => {
    getDepartment.mockResolvedValue({
      ok: true,
      value: department({ manager: { userId: "u-ana", name: "Ana", email: "ana@potriv.test" } }),
    });

    await expectStays(
      deleteDepartmentAction(EMPTY_DEPARTMENT_STATE, form({ departmentId: DEPARTMENT })),
    );
    expect(deleteDepartment).not.toHaveBeenCalled();
  });

  it("stays on a fresh member blocker", async () => {
    getDepartment.mockResolvedValue({ ok: true, value: department({ memberCount: 2 }) });

    await expectStays(
      deleteDepartmentAction(EMPTY_DEPARTMENT_STATE, form({ departmentId: DEPARTMENT })),
    );
    expect(deleteDepartment).not.toHaveBeenCalled();
  });

  it("stays on a backend conflict it could not have predicted", async () => {
    // Linked skills and any other module's guard: a 409 is a refusal, and a
    // refusal that navigated to the list would read as success.
    deleteDepartment.mockResolvedValue({
      ok: false,
      status: 409,
      detail: "Department has linked skills and cannot be deleted.",
    });

    const state = await expectStays(
      deleteDepartmentAction(EMPTY_DEPARTMENT_STATE, form({ departmentId: DEPARTMENT })),
    );
    expect(state.error).toContain("linked skills");
  });

  it("stays when the department is missing or not visible", async () => {
    for (const reason of ["NOT_FOUND", "FORBIDDEN"]) {
      vi.clearAllMocks();
      getDepartment.mockResolvedValue({ ok: false, reason });

      await expectStays(
        deleteDepartmentAction(EMPTY_DEPARTMENT_STATE, form({ departmentId: DEPARTMENT })),
      );
      expect(deleteDepartment).not.toHaveBeenCalled();
    }
  });

  it("stays on a server failure", async () => {
    deleteDepartment.mockResolvedValue({ ok: false, status: 500, detail: null });

    await expectStays(
      deleteDepartmentAction(EMPTY_DEPARTMENT_STATE, form({ departmentId: DEPARTMENT })),
    );
  });

  it("stays on an identifier that is not one", async () => {
    for (const departmentId of ["", "../departments", "not-a-uuid"]) {
      vi.clearAllMocks();

      await expectStays(deleteDepartmentAction(EMPTY_DEPARTMENT_STATE, form({ departmentId })));
      expect(getDepartment).not.toHaveBeenCalled();
    }
  });

  it("stays for a caller without the organization-admin role", async () => {
    resolveProductSession.mockResolvedValue({
      authenticated: true,
      user: { userId: "dm-1", roles: ["EMPLOYEE", "DEPARTMENT_MANAGER"] },
    });

    await expectStays(
      deleteDepartmentAction(EMPTY_DEPARTMENT_STATE, form({ departmentId: DEPARTMENT })),
    );
    expect(getDepartment).not.toHaveBeenCalled();
  });
});

describe("the trust boundary", () => {
  beforeEach(() => {
    resolveProductSession.mockResolvedValue({
      authenticated: true,
      user: { userId: "dm-1", roles: ["EMPLOYEE", "DEPARTMENT_MANAGER"] },
    });
  });

  it("refuses a session without the organization-admin role, before reading anything", async () => {
    await createDepartmentAction(EMPTY_DEPARTMENT_STATE, form({ name: "Platform" }));
    await updateDepartmentAction(
      EMPTY_DEPARTMENT_STATE,
      form({ departmentId: DEPARTMENT, name: "Platform" }),
    );
    await deleteDepartmentAction(EMPTY_DEPARTMENT_STATE, form({ departmentId: DEPARTMENT }));

    expect(createDepartment).not.toHaveBeenCalled();
    expect(updateDepartment).not.toHaveBeenCalled();
    expect(deleteDepartment).not.toHaveBeenCalled();
    expect(getDepartment).not.toHaveBeenCalled();
  });
});

describe("what crosses back to the browser", () => {
  const LEAKS = [
    "Bearer",
    "Authorization",
    "accessToken",
    "refreshToken",
    "localhost:8080",
    "/api/",
    "/departments/",
    "Exception",
    "timestamp",
  ];

  it("carries no token, header, backend path or envelope on any failure", async () => {
    for (const status of [400, 401, 403, 404, 409, 500]) {
      createDepartment.mockResolvedValue({ ok: false, status, detail: null });
      updateDepartment.mockResolvedValue({ ok: false, status, detail: null });
      deleteDepartment.mockResolvedValue({ ok: false, status, detail: null });

      for (const state of [
        await createDepartmentAction(EMPTY_DEPARTMENT_STATE, form({ name: "Platform" })),
        await updateDepartmentAction(
          EMPTY_DEPARTMENT_STATE,
          form({ departmentId: DEPARTMENT, name: "Platform" }),
        ),
        await deleteDepartmentAction(EMPTY_DEPARTMENT_STATE, form({ departmentId: DEPARTMENT })),
      ]) {
        const serialized = JSON.stringify(state);
        for (const leak of LEAKS) expect(serialized).not.toContain(leak);
      }
    }
  });
});
