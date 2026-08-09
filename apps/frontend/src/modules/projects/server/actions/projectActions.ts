"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { backendDelete, backendPatch, backendPost } from "@/modules/auth/server-public";
import { resolveProductSession } from "@/modules/auth/server/productSession";

import type { ProjectActionState } from "../../model/projectActionState";
import type { ProjectWritePayload } from "../../model/projectForm";
import { validateProjectForm } from "../../model/projectForm";
import { readProjectForm } from "../../model/projectFormData";
import { getManagedProject, getTeamRoleCatalogue } from "../projectsDataSources";

/**
 * Project mutations, owned by the server.
 *
 * The browser posts a form and gets back either a redirect or field errors. It
 * never names a backend path, never sees a token, and never learns anything about
 * the backend from a failure — the paths are written here as literals with an
 * identifier substituted into them, and every error is narrowed to a small
 * product shape before it can travel back.
 *
 * Validation runs again here even though the form already ran it. Client
 * validation is how the screen stays pleasant; this is the one that decides.
 *
 * Each success revalidates the paths it changed. Without that, the redirect
 * lands on a page served from the router cache — delete a project and the list
 * you arrive at still shows it, until something else forces a reload.
 */

type ProductErrorCode =
  | "VALIDATION"
  | "CONFLICT"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "UNAUTHENTICATED"
  | "SERVER";

/**
 * What the person reading the screen is told, per failure kind.
 *
 * The backend's own sentence is preferred where it exists and survived the
 * transport's checks — it is the only source that knows *why* a conflict
 * happened — and these are the fallbacks when it does not.
 */
const FALLBACK_MESSAGE: Readonly<Record<ProductErrorCode, string>> = {
  VALIDATION: "Some of these details were not accepted. Check the form and try again.",
  CONFLICT: "This change conflicts with the project's current state.",
  // The same sentence as NOT_FOUND, deliberately: a project that is not there
  // and a project you may not touch must not be distinguishable from outside.
  FORBIDDEN: "This project does not exist or is not visible to you.",
  NOT_FOUND: "This project does not exist or is not visible to you.",
  UNAUTHENTICATED: "Your session has expired. Sign in again to continue.",
  SERVER: "Something went wrong. Try again.",
};

function codeFor(status: number): ProductErrorCode {
  if (status === 400 || status === 422) return "VALIDATION";
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  return "SERVER";
}

/** A failure, reduced to one sentence. No status, no path, no envelope. */
function formFailure(status: number, detail: string | null): ProjectActionState {
  const code = codeFor(status);
  return { fieldErrors: {}, formError: detail ?? FALLBACK_MESSAGE[code] };
}

/**
 * An identifier, not a path.
 *
 * The route supplies which project is being edited, and it arrives through the
 * browser like everything else in a form. It is narrowed to the shape of an id
 * before it can be substituted into a path written here — and even then the
 * backend answers 404 for a project this user does not own, which is what
 * actually enforces ownership.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readProjectId(formData: FormData): string | null {
  const value = formData.get("projectId");
  return typeof value === "string" && UUID.test(value) ? value : null;
}

async function requireProjectManager(): Promise<boolean> {
  const session = await resolveProductSession();
  return session.authenticated && session.user.roles.includes("PROJECT_MANAGER");
}

// ---------------------------------------------------------------- create

export async function createProjectAction(
  _previous: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  if (!(await requireProjectManager())) {
    return { fieldErrors: {}, formError: FALLBACK_MESSAGE.FORBIDDEN };
  }

  // Active roles only: a new project cannot require a role nobody may be given.
  const catalogue = await getTeamRoleCatalogue(false);
  if (!catalogue.ok) {
    return {
      fieldErrors: {},
      formError: "Team roles could not be loaded, so the project was not created.",
    };
  }

  const validated = validateProjectForm(readProjectForm(formData), {
    mode: "create",
    catalogue: catalogue.value,
  });
  if (!validated.ok) {
    return { fieldErrors: validated.fieldErrors, formError: validated.formError };
  }

  const created = await backendPost<{ projectId: string }>("/projects", validated.payload);
  if (!created.ok) {
    return formFailure(created.error.status, created.error.detail);
  }

  // No optimistic project: the id comes from the response that created it.
  revalidatePath("/projects");
  redirect(`/projects/${created.value.projectId}`);
}

// ---------------------------------------------------------------- update

export async function updateProjectAction(
  _previous: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  if (!(await requireProjectManager())) {
    return { fieldErrors: {}, formError: FALLBACK_MESSAGE.FORBIDDEN };
  }

  const projectId = readProjectId(formData);
  if (projectId === null) {
    return { fieldErrors: {}, formError: FALLBACK_MESSAGE.NOT_FOUND };
  }

  // Both are re-read rather than trusted from hidden fields: which roles this
  // project already has decides which inactive roles may stay, and a form could
  // otherwise claim any of them.
  const [project, catalogue] = await Promise.all([
    getManagedProject(projectId),
    getTeamRoleCatalogue(true),
  ]);

  if (!project.ok) {
    return {
      fieldErrors: {},
      formError:
        project.reason === "NOT_FOUND"
          ? FALLBACK_MESSAGE.NOT_FOUND
          : FALLBACK_MESSAGE[project.reason === "FORBIDDEN" ? "FORBIDDEN" : "SERVER"],
    };
  }
  if (!catalogue.ok) {
    return {
      fieldErrors: {},
      formError: "Team roles could not be loaded, so no changes were saved.",
    };
  }

  const validated = validateProjectForm(readProjectForm(formData), {
    mode: "edit",
    catalogue: catalogue.value,
    preservableRoleIds: project.value.teamRoles.map((role) => role.teamRoleId),
  });
  if (!validated.ok) {
    return { fieldErrors: validated.fieldErrors, formError: validated.formError };
  }

  const saved = await backendPatch<unknown>(`/projects/${projectId}`, updateBody(validated.payload));
  if (!saved.ok) {
    return formFailure(saved.error.status, saved.error.detail);
  }

  // The project's own pages and every list it appears on.
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/team`);
  redirect(`/projects/${projectId}`);
}

/**
 * The complete editable definition, every time.
 *
 * `PATCH` treats a missing field as "leave unchanged" and a missing list as
 * "leave the collection alone", so this screen — which shows the whole
 * definition — has to send the whole definition. Two consequences are the point
 * rather than an accident:
 *
 * - `technologyStack: []` and `teamRoles: []` really do clear those collections.
 * - `generalDescription: ""` really does clear the description, where `null`
 *   would have meant "keep the old one".
 */
function updateBody(payload: ProjectWritePayload): Record<string, unknown> {
  return {
    name: payload.name,
    period: payload.period,
    startDate: payload.startDate,
    // Absent for an ongoing project, which is how the backend clears a deadline
    // left over from when the project was fixed.
    ...(payload.deadlineDate === null ? {} : { deadlineDate: payload.deadlineDate }),
    status: payload.status,
    generalDescription: payload.generalDescription,
    technologyStack: payload.technologyStack,
    teamRoles: payload.teamRoles,
  };
}

// ---------------------------------------------------------------- delete

export async function deleteProjectAction(
  _previous: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  if (!(await requireProjectManager())) {
    return { fieldErrors: {}, formError: FALLBACK_MESSAGE.FORBIDDEN };
  }

  const projectId = readProjectId(formData);
  if (projectId === null) {
    return { fieldErrors: {}, formError: FALLBACK_MESSAGE.NOT_FOUND };
  }

  // Deletability is not predicted here. It depends on whether the project ever
  // reached IN_PROGRESS, CLOSING or CLOSED, and no endpoint exposes that history
  // — so the request is made and the backend decides. `confirmed=true` is
  // required by the backend and is never omitted.
  const deleted = await backendDelete(`/projects/${projectId}?confirmed=true`);
  if (!deleted.ok) {
    return formFailure(deleted.error.status, deleted.error.detail);
  }

  revalidatePath("/projects");
  redirect("/projects?view=managed");
}
