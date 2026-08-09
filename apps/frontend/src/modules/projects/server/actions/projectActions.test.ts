import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TeamRoleCatalogueEntry } from "../../model/projectDetail";
import { EMPTY_ACTION_STATE } from "../../model/projectActionState";

/**
 * The three project mutations, as the browser experiences them.
 *
 * Two things are asserted throughout: the **payload** that reaches the backend,
 * because a form that validates correctly and then sends the wrong body is still
 * broken; and the **shape of what comes back**, because everything returned here
 * crosses to the browser.
 */

const backendPost = vi.fn();
const backendPatch = vi.fn();
const backendDelete = vi.fn();
const resolveProductSession = vi.fn();
const getManagedProject = vi.fn();
const getTeamRoleCatalogue = vi.fn();
const revalidatePath = vi.fn();
const redirect = vi.fn((path: string) => {
  // Next's redirect throws; mirroring that keeps the control flow honest.
  throw new RedirectSignal(path);
});

class RedirectSignal extends Error {
  constructor(readonly path: string) {
    super("redirect");
  }
}

vi.mock("@/modules/auth/server-public", () => ({ backendPost, backendPatch, backendDelete }));
vi.mock("@/modules/auth/server/productSession", () => ({ resolveProductSession }));
vi.mock("../projectsDataSources", () => ({ getManagedProject, getTeamRoleCatalogue }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath }));

const { createProjectAction, deleteProjectAction, updateProjectAction } = await import(
  "./projectActions"
);

const PROJECT_ID = "0f7d1c62-4b0e-4a6f-9d2a-7c1b8e5f3a10";

const BACKEND_ROLE: TeamRoleCatalogueEntry = {
  teamRoleId: "3a1f0b44-1111-4222-8333-444455556666",
  name: "Backend",
  description: null,
  active: true,
};
const RETIRED_ROLE: TeamRoleCatalogueEntry = {
  teamRoleId: "3a1f0b44-9999-4222-8333-444455556666",
  name: "Deprecated QA",
  description: null,
  active: false,
};

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const entry of Array.isArray(value) ? value : [value]) data.append(name, entry);
  }
  return data;
}

function validForm(overrides: Record<string, string | string[]> = {}): FormData {
  return form({
    name: "Apollo",
    period: "FIXED",
    startDate: "2026-08-01",
    deadlineDate: "2026-12-31",
    status: "NOT_STARTED",
    generalDescription: "A description",
    ...overrides,
  });
}

/** Runs an action that is expected to redirect, and returns where to. */
async function redirectPathOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof RedirectSignal) return error.path;
    throw error;
  }
  throw new Error("expected a redirect");
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveProductSession.mockResolvedValue({
    authenticated: true,
    user: { userId: "u1", roles: ["EMPLOYEE", "PROJECT_MANAGER"] },
  });
  getTeamRoleCatalogue.mockResolvedValue({ ok: true, value: [BACKEND_ROLE, RETIRED_ROLE] });
  getManagedProject.mockResolvedValue({
    ok: true,
    value: { projectId: PROJECT_ID, name: "Apollo", teamRoles: [] },
  });
  backendPost.mockResolvedValue({ ok: true, value: { projectId: PROJECT_ID } });
  backendPatch.mockResolvedValue({ ok: true, value: {} });
  backendDelete.mockResolvedValue({ ok: true, value: undefined });
});

describe("createProjectAction", () => {
  it("refuses anyone without the project-manager role, before asking the backend", async () => {
    resolveProductSession.mockResolvedValue({
      authenticated: true,
      user: { userId: "u1", roles: ["EMPLOYEE"] },
    });

    const state = await createProjectAction(EMPTY_ACTION_STATE, validForm());

    expect(state.formError).toBeDefined();
    expect(getTeamRoleCatalogue).not.toHaveBeenCalled();
    expect(backendPost).not.toHaveBeenCalled();
  });

  it("posts the normalized definition and redirects to the created project", async () => {
    const path = await redirectPathOf(() =>
      createProjectAction(
        EMPTY_ACTION_STATE,
        validForm({
          technology: ["  Spring   Boot ", ""],
          teamRoleId: [BACKEND_ROLE.teamRoleId],
          requiredMembers: ["3"],
        }),
      ),
    );

    expect(backendPost).toHaveBeenCalledWith("/projects", {
      name: "Apollo",
      period: "FIXED",
      startDate: "2026-08-01",
      deadlineDate: "2026-12-31",
      status: "NOT_STARTED",
      generalDescription: "A description",
      technologyStack: ["Spring Boot"],
      teamRoles: [{ teamRoleId: BACKEND_ROLE.teamRoleId, requiredMembers: 3 }],
    });
    // The id comes from the response, never guessed ahead of it.
    expect(path).toBe(`/projects/${PROJECT_ID}`);
  });

  it("uses only active roles, so an inactive one cannot start a project", async () => {
    const state = await createProjectAction(
      EMPTY_ACTION_STATE,
      validForm({ teamRoleId: [RETIRED_ROLE.teamRoleId], requiredMembers: ["1"] }),
    );

    expect(state.fieldErrors["requirement.0"]).toContain("inactive");
    expect(backendPost).not.toHaveBeenCalled();
  });

  it("validates again on the server, whatever the browser sent", async () => {
    // A client can post anything; this is the run that decides.
    const state = await createProjectAction(
      EMPTY_ACTION_STATE,
      validForm({ status: "IN_PROGRESS" }),
    );

    expect(state.fieldErrors.status).toBeDefined();
    expect(backendPost).not.toHaveBeenCalled();
  });

  it("does not create anything when the catalogue could not be loaded", async () => {
    getTeamRoleCatalogue.mockResolvedValue({ ok: false, reason: "ERROR" });

    const state = await createProjectAction(EMPTY_ACTION_STATE, validForm());

    expect(state.formError).toContain("not created");
    expect(backendPost).not.toHaveBeenCalled();
  });
});

describe("updateProjectAction", () => {
  function editForm(overrides: Record<string, string | string[]> = {}): FormData {
    return validForm({ projectId: PROJECT_ID, ...overrides });
  }

  it("sends the complete definition, including empty lists that clear collections", async () => {
    await redirectPathOf(() => updateProjectAction(EMPTY_ACTION_STATE, editForm()));

    const [, body] = backendPatch.mock.calls[0]!;
    // Present and empty, not absent: absent would mean "leave them alone".
    expect(body.technologyStack).toEqual([]);
    expect(body.teamRoles).toEqual([]);
  });

  it("clears the description with a present empty string", async () => {
    await redirectPathOf(() =>
      updateProjectAction(EMPTY_ACTION_STATE, editForm({ generalDescription: "   " })),
    );

    const [, body] = backendPatch.mock.calls[0]!;
    expect(body.generalDescription).toBe("");
    expect("generalDescription" in body).toBe(true);
  });

  it("never submits the old deadline when switching to an ongoing project", async () => {
    await redirectPathOf(() =>
      updateProjectAction(
        EMPTY_ACTION_STATE,
        editForm({ period: "ONGOING", deadlineDate: "" }),
      ),
    );

    const [, body] = backendPatch.mock.calls[0]!;
    expect(body.period).toBe("ONGOING");
    // Absent, which is how the backend clears the stored deadline.
    expect("deadlineDate" in body).toBe(false);
  });

  it("requires a deadline when switching back to a fixed project", async () => {
    const state = await updateProjectAction(
      EMPTY_ACTION_STATE,
      editForm({ period: "FIXED", deadlineDate: "" }),
    );

    expect(state.fieldErrors.deadlineDate).toBeDefined();
    expect(backendPatch).not.toHaveBeenCalled();
  });

  it("keeps an attached inactive role while saving an unrelated change", async () => {
    // The project already requires the retired role, so it survives the edit.
    getManagedProject.mockResolvedValue({
      ok: true,
      value: {
        projectId: PROJECT_ID,
        name: "Apollo",
        teamRoles: [{ teamRoleId: RETIRED_ROLE.teamRoleId, requiredMembers: 1 }],
      },
    });

    await redirectPathOf(() =>
      updateProjectAction(
        EMPTY_ACTION_STATE,
        editForm({
          name: "Apollo renamed",
          teamRoleId: [RETIRED_ROLE.teamRoleId],
          requiredMembers: ["1"],
        }),
      ),
    );

    const [, body] = backendPatch.mock.calls[0]!;
    expect(body.name).toBe("Apollo renamed");
    expect(body.teamRoles).toEqual([{ teamRoleId: RETIRED_ROLE.teamRoleId, requiredMembers: 1 }]);
  });

  it("reads which roles are preservable from the backend, not from the form", async () => {
    // The project has no inactive role attached, so claiming one must fail even
    // though the form said so.
    const state = await updateProjectAction(
      EMPTY_ACTION_STATE,
      editForm({ teamRoleId: [RETIRED_ROLE.teamRoleId], requiredMembers: ["1"] }),
    );

    expect(state.fieldErrors["requirement.0"]).toContain("inactive");
    expect(backendPatch).not.toHaveBeenCalled();
  });

  it("saves nothing when the catalogue could not be loaded", async () => {
    // Otherwise the requirement list would be rebuilt from whatever loaded.
    getTeamRoleCatalogue.mockResolvedValue({ ok: false, reason: "ERROR" });

    const state = await updateProjectAction(EMPTY_ACTION_STATE, editForm());

    expect(state.formError).toContain("no changes were saved");
    expect(backendPatch).not.toHaveBeenCalled();
  });

  it("says the same thing for a project that is missing as for one that is not yours", async () => {
    getManagedProject.mockResolvedValue({ ok: false, reason: "NOT_FOUND" });

    const state = await updateProjectAction(EMPTY_ACTION_STATE, editForm());

    expect(state.formError).toBe("This project does not exist or is not visible to you.");
    expect(state.formError).not.toContain("own");
  });

  it("rejects anything that is not an identifier", async () => {
    for (const projectId of ["", "../projects", "1 OR 1=1", "not-a-uuid"]) {
      const state = await updateProjectAction(EMPTY_ACTION_STATE, editForm({ projectId }));

      expect(state.formError).toBeDefined();
      expect(backendPatch).not.toHaveBeenCalled();
    }
  });

  it("refuses a session without the project-manager role", async () => {
    resolveProductSession.mockResolvedValue({
      authenticated: true,
      user: { userId: "u1", roles: ["EMPLOYEE", "DEPARTMENT_MANAGER"] },
    });

    const state = await updateProjectAction(EMPTY_ACTION_STATE, editForm());

    expect(state.formError).toBeDefined();
    expect(getManagedProject).not.toHaveBeenCalled();
    expect(backendPatch).not.toHaveBeenCalled();
  });
});

describe("deleteProjectAction", () => {
  it("always confirms, and redirects to the managed list on success", async () => {
    const path = await redirectPathOf(() =>
      deleteProjectAction(EMPTY_ACTION_STATE, form({ projectId: PROJECT_ID })),
    );

    expect(backendDelete).toHaveBeenCalledWith(`/projects/${PROJECT_ID}?confirmed=true`);
    expect(path).toBe("/projects?view=managed");
    // Otherwise the list you land on is served from the router cache and still
    // shows the project that was just deleted.
    expect(revalidatePath).toHaveBeenCalledWith("/projects");
  });

  it("explains a refusal and stays put, even for a project still in planning", async () => {
    // Deletability depends on status *history*, which no endpoint exposes — so a
    // NOT_STARTED project can still be undeletable, and the frontend never
    // claims otherwise.
    backendDelete.mockResolvedValue({
      ok: false,
      error: {
        status: 409,
        detail: "This project has progressed beyond planning and can no longer be deleted.",
      },
    });

    const state = await deleteProjectAction(EMPTY_ACTION_STATE, form({ projectId: PROJECT_ID }));

    expect(state.formError).toContain("can no longer be deleted");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("uses the anti-leak sentence for a project it cannot see", async () => {
    backendDelete.mockResolvedValue({ ok: false, error: { status: 404, detail: null } });

    const state = await deleteProjectAction(EMPTY_ACTION_STATE, form({ projectId: PROJECT_ID }));

    expect(state.formError).toBe("This project does not exist or is not visible to you.");
  });

  it("refuses a session without the project-manager role", async () => {
    resolveProductSession.mockResolvedValue({
      authenticated: true,
      user: { userId: "u1", roles: ["EMPLOYEE"] },
    });

    const state = await deleteProjectAction(EMPTY_ACTION_STATE, form({ projectId: PROJECT_ID }));

    expect(state.formError).toBeDefined();
    expect(backendDelete).not.toHaveBeenCalled();
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
    "/projects/",
    "Exception",
    "timestamp",
  ];

  function assertNoLeak(state: unknown) {
    const serialized = JSON.stringify(state);
    for (const leak of LEAKS) expect(serialized).not.toContain(leak);
  }

  it("carries no token, header, backend path or envelope on any failure", async () => {
    for (const status of [400, 401, 403, 404, 409, 500]) {
      backendPatch.mockResolvedValue({ ok: false, error: { status, detail: null } });

      assertNoLeak(
        await updateProjectAction(EMPTY_ACTION_STATE, validForm({ projectId: PROJECT_ID })),
      );
    }
  });

  it("carries no backend path when a create fails", async () => {
    backendPost.mockResolvedValue({ ok: false, error: { status: 500, detail: null } });

    assertNoLeak(await createProjectAction(EMPTY_ACTION_STATE, validForm()));
  });

  it("carries only field names and sentences when validation fails", async () => {
    const state = await createProjectAction(EMPTY_ACTION_STATE, validForm({ name: "" }));

    assertNoLeak(state);
    expect(Object.keys(state.fieldErrors)).toEqual(["name"]);
  });
});
