"use server";

import { revalidatePath } from "next/cache";

import { resolveProductSession } from "@/modules/auth/server/productSession";

import {
  validateCategoryName,
  validateSkillForm,
} from "../../model/skillAdmin";
import type { SkillAdminActionState } from "../../model/skillsActionState";
import {
  createCatalogueSkill,
  createSkillCategory,
  deactivateCatalogueSkill,
  deactivateSkillCategory,
  getManagedDepartment,
  getSkill,
  getSkillCategories,
  linkSkillToCurrentDepartment,
  unlinkSkillFromCurrentDepartment,
  updateCatalogueSkill,
  updateSkillCategory,
} from "../skillsDataSources";

/**
 * Administering the shared skill catalogue.
 *
 * Three authorities, checked separately because they are separate:
 *
 * - Creating categories and skills needs the Department Manager **role**.
 * - Changing a skill's content or state needs the caller to be that skill's
 *   **author**, re-read from the backend on every attempt. A browser saying
 *   `isAuthor` is not evidence, and another manager tampering with a form must
 *   fail before anything is written.
 * - Linking a department needs an actual manager **appointment**, resolved
 *   server-side from `GET /department/projects`. The endpoint takes no
 *   department id at all, so no submission can aim at somebody else's.
 *
 * Deactivation is soft in every case. Nothing here deletes a category or a skill,
 * and nothing cascades: retiring a category leaves its skills, their links and
 * everybody's assignments exactly as they were.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FALLBACK = {
  FORBIDDEN: "You do not have permission to manage the skill catalogue.",
  NOT_AUTHOR: "Only the person who added this skill can change it.",
  NO_DEPARTMENT: "You are not assigned as a department manager.",
  CATEGORY_UNAVAILABLE: "This category does not exist or is not visible to you.",
  SKILL_UNAVAILABLE: "This skill does not exist or is not visible to you.",
  INACTIVE_CATEGORY: "Choose an active category.",
  INACTIVE_SKILL: "An inactive skill cannot receive new department links.",
  CONFLICT: "That change conflicts with the current state. Refresh and try again.",
  VALIDATION: "That was not accepted.",
  UNAUTHENTICATED: "Your session has expired. Sign in again to continue.",
  SERVER: "Something went wrong. Try again.",
} as const;

type Subject = "category" | "skill";

function messageFor(subject: Subject, status: number, detail: string | null): string {
  if (detail !== null) return detail;
  if (status === 400 || status === 422) return FALLBACK.VALIDATION;
  if (status === 401) return FALLBACK.UNAUTHENTICATED;
  if (status === 403) return FALLBACK.FORBIDDEN;
  if (status === 404) {
    return subject === "category" ? FALLBACK.CATEGORY_UNAVAILABLE : FALLBACK.SKILL_UNAVAILABLE;
  }
  if (status === 409) return FALLBACK.CONFLICT;
  return FALLBACK.SERVER;
}

type Session = { readonly userId: string; readonly roles: readonly string[] };

async function requireDepartmentManager(): Promise<Session | null> {
  const session = await resolveProductSession();
  if (!session.authenticated) return null;
  if (!session.user.roles.includes("DEPARTMENT_MANAGER")) return null;
  return { userId: session.user.userId, roles: session.user.roles };
}

function refreshCatalogue(skillId?: string): void {
  revalidatePath("/skills");
  revalidatePath("/skills/categories");
  if (skillId) revalidatePath(`/skills/${skillId}`);
}

/* ── Categories ─────────────────────────────────────────────────────────── */

export async function createSkillCategoryAction(
  _previous: SkillAdminActionState,
  formData: FormData,
): Promise<SkillAdminActionState> {
  if (!(await requireDepartmentManager())) return { error: FALLBACK.FORBIDDEN };

  const raw = typeof formData.get("name") === "string" ? String(formData.get("name")) : "";
  const validated = validateCategoryName(raw);
  if (!validated.ok) return { fieldErrors: { name: validated.error }, name: raw };

  const created = await createSkillCategory(validated.name);
  if (!created.ok) {
    return { error: messageFor("category", created.status, created.detail), name: raw };
  }

  refreshCatalogue();

  return { done: `${created.value.name} was created.` };
}

export async function updateSkillCategoryAction(
  _previous: SkillAdminActionState,
  formData: FormData,
): Promise<SkillAdminActionState> {
  if (!(await requireDepartmentManager())) return { error: FALLBACK.FORBIDDEN };

  const categoryId = formData.get("categoryId");
  if (typeof categoryId !== "string" || !UUID.test(categoryId)) {
    return { error: FALLBACK.CATEGORY_UNAVAILABLE };
  }

  const raw = typeof formData.get("name") === "string" ? String(formData.get("name")) : "";
  const validated = validateCategoryName(raw);
  if (!validated.ok) return { fieldErrors: { name: validated.error }, name: raw };

  // Only the name; the state has its own actions, so a rename cannot reactivate.
  const updated = await updateSkillCategory(categoryId, { name: validated.name });
  if (!updated.ok) {
    return { error: messageFor("category", updated.status, updated.detail), name: raw };
  }

  refreshCatalogue();

  return { done: `Renamed to ${updated.value.name}.` };
}

/**
 * Retiring a category.
 *
 * Soft, and deliberately not a cascade: the skills inside it stay exactly as they
 * were, active ones included. That leaves the backend able to hold an active
 * skill in a retired category, which the product shows rather than tidying away.
 */
export async function deactivateSkillCategoryAction(
  _previous: SkillAdminActionState,
  formData: FormData,
): Promise<SkillAdminActionState> {
  if (!(await requireDepartmentManager())) return { error: FALLBACK.FORBIDDEN };

  const categoryId = formData.get("categoryId");
  if (typeof categoryId !== "string" || !UUID.test(categoryId)) {
    return { error: FALLBACK.CATEGORY_UNAVAILABLE };
  }

  const deactivated = await deactivateSkillCategory(categoryId);
  if (!deactivated.ok) {
    return { error: messageFor("category", deactivated.status, deactivated.detail) };
  }

  refreshCatalogue();

  return { done: "The category is retired. Its skills are unchanged." };
}

export async function reactivateSkillCategoryAction(
  _previous: SkillAdminActionState,
  formData: FormData,
): Promise<SkillAdminActionState> {
  if (!(await requireDepartmentManager())) return { error: FALLBACK.FORBIDDEN };

  const categoryId = formData.get("categoryId");
  if (typeof categoryId !== "string" || !UUID.test(categoryId)) {
    return { error: FALLBACK.CATEGORY_UNAVAILABLE };
  }

  // Only the flag: a restore must not carry a name along and rewrite it.
  const reactivated = await updateSkillCategory(categoryId, { active: true });
  if (!reactivated.ok) {
    return { error: messageFor("category", reactivated.status, reactivated.detail) };
  }

  refreshCatalogue();

  return { done: `${reactivated.value.name} is available again.` };
}

/* ── Skills ─────────────────────────────────────────────────────────────── */

/**
 * Creating a catalogue skill.
 *
 * Any department manager may. The category is re-read and must be active — the
 * backend refuses otherwise — and the author is whoever the backend sees on the
 * request, never a field in the form.
 */
export async function createCatalogueSkillAction(
  _previous: SkillAdminActionState,
  formData: FormData,
): Promise<SkillAdminActionState> {
  if (!(await requireDepartmentManager())) return { error: FALLBACK.FORBIDDEN };

  const categoryId =
    typeof formData.get("categoryId") === "string" ? String(formData.get("categoryId")) : "";
  const name = typeof formData.get("name") === "string" ? String(formData.get("name")) : "";
  const description =
    typeof formData.get("description") === "string" ? String(formData.get("description")) : "";

  const validated = validateSkillForm(categoryId, name, description);
  if (!validated.ok) {
    return { fieldErrors: validated.errors, categoryId, name, description };
  }

  const categories = await getSkillCategories(true);
  if (!categories.ok) return { error: FALLBACK.SERVER };

  const category = categories.value.find(
    (candidate) => candidate.categoryId === validated.values.categoryId,
  );
  if (!category) {
    return { error: FALLBACK.CATEGORY_UNAVAILABLE, categoryId, name, description };
  }
  if (!category.active) {
    return { error: FALLBACK.INACTIVE_CATEGORY, categoryId, name, description };
  }

  const created = await createCatalogueSkill(
    validated.values.categoryId,
    validated.values.name,
    validated.values.description,
  );
  if (!created.ok) {
    // A duplicate is per category, so the same name under another category is
    // fine; the entered values come back so it can be moved rather than retyped.
    return {
      error: messageFor("skill", created.status, created.detail),
      categoryId,
      name,
      description,
    };
  }

  refreshCatalogue(created.value.skillId);

  return { done: `${created.value.name} was added to the catalogue.` };
}

/**
 * Proving the caller may change this skill's content.
 *
 * A fresh read, every time. The page may have rendered when they were the author
 * — they never stop being it — but more to the point, the page may not have
 * rendered for them at all.
 */
async function requireAuthorship(
  skillId: string,
): Promise<{ readonly ok: true; readonly name: string } | { readonly ok: false; readonly error: string }> {
  const session = await requireDepartmentManager();
  if (!session) return { ok: false, error: FALLBACK.FORBIDDEN };

  const fresh = await getSkill(skillId);
  if (!fresh.ok) {
    return {
      ok: false,
      error: fresh.reason === "ERROR" ? FALLBACK.SERVER : FALLBACK.SKILL_UNAVAILABLE,
    };
  }

  if (fresh.value.author.userId !== session.userId) {
    return { ok: false, error: FALLBACK.NOT_AUTHOR };
  }

  return { ok: true, name: fresh.value.name };
}

export async function updateCatalogueSkillAction(
  _previous: SkillAdminActionState,
  formData: FormData,
): Promise<SkillAdminActionState> {
  const skillId = formData.get("skillId");
  if (typeof skillId !== "string" || !UUID.test(skillId)) {
    return { error: FALLBACK.SKILL_UNAVAILABLE };
  }

  const categoryId =
    typeof formData.get("categoryId") === "string" ? String(formData.get("categoryId")) : "";
  const name = typeof formData.get("name") === "string" ? String(formData.get("name")) : "";
  const description =
    typeof formData.get("description") === "string" ? String(formData.get("description")) : "";

  const validated = validateSkillForm(categoryId, name, description);
  if (!validated.ok) {
    return { fieldErrors: validated.errors, categoryId, name, description };
  }

  const author = await requireAuthorship(skillId);
  if (!author.ok) return { error: author.error, categoryId, name, description };

  const categories = await getSkillCategories(true);
  if (!categories.ok) return { error: FALLBACK.SERVER };

  const category = categories.value.find(
    (candidate) => candidate.categoryId === validated.values.categoryId,
  );
  if (!category) {
    return { error: FALLBACK.CATEGORY_UNAVAILABLE, categoryId, name, description };
  }
  if (!category.active) {
    return { error: FALLBACK.INACTIVE_CATEGORY, categoryId, name, description };
  }

  // Content only. The state is changed by its own actions, so an edit can never
  // silently restore a retired skill.
  const updated = await updateCatalogueSkill(skillId, {
    categoryId: validated.values.categoryId,
    name: validated.values.name,
    description: validated.values.description,
  });
  if (!updated.ok) {
    return {
      error: messageFor("skill", updated.status, updated.detail),
      categoryId,
      name,
      description,
    };
  }

  refreshCatalogue(skillId);

  return { done: `${updated.value.name} was updated.` };
}

export async function deactivateCatalogueSkillAction(
  _previous: SkillAdminActionState,
  formData: FormData,
): Promise<SkillAdminActionState> {
  const skillId = formData.get("skillId");
  if (typeof skillId !== "string" || !UUID.test(skillId)) {
    return { error: FALLBACK.SKILL_UNAVAILABLE };
  }

  const author = await requireAuthorship(skillId);
  if (!author.ok) return { error: author.error };

  const deactivated = await deactivateCatalogueSkill(skillId);
  if (!deactivated.ok) {
    return { error: messageFor("skill", deactivated.status, deactivated.detail) };
  }

  refreshCatalogue(skillId);

  return {
    done: `${author.name} is retired. It cannot be newly added, and existing skill profiles keep it.`,
  };
}

export async function reactivateCatalogueSkillAction(
  _previous: SkillAdminActionState,
  formData: FormData,
): Promise<SkillAdminActionState> {
  const skillId = formData.get("skillId");
  if (typeof skillId !== "string" || !UUID.test(skillId)) {
    return { error: FALLBACK.SKILL_UNAVAILABLE };
  }

  const author = await requireAuthorship(skillId);
  if (!author.ok) return { error: author.error };

  const reactivated = await updateCatalogueSkill(skillId, { active: true });
  if (!reactivated.ok) {
    return { error: messageFor("skill", reactivated.status, reactivated.detail) };
  }

  refreshCatalogue(skillId);

  return { done: `${reactivated.value.name} is available again.` };
}

/* ── Department links ───────────────────────────────────────────────────── */

/**
 * Linking the caller's own department to a skill.
 *
 * The appointment is what matters, not the role and not authorship: a manager may
 * link their department to a skill somebody else wrote, because the link says
 * "we use this here" rather than "this is mine". The department is never taken
 * from the form — the backend resolves it — so nothing submitted can point it
 * elsewhere.
 */
export async function linkSkillToCurrentDepartmentAction(
  _previous: SkillAdminActionState,
  formData: FormData,
): Promise<SkillAdminActionState> {
  if (!(await requireDepartmentManager())) return { error: FALLBACK.FORBIDDEN };

  const skillId = formData.get("skillId");
  if (typeof skillId !== "string" || !UUID.test(skillId)) {
    return { error: FALLBACK.SKILL_UNAVAILABLE };
  }

  const department = await getManagedDepartment();
  if (!department.ok) {
    return { error: department.reason === "ERROR" ? FALLBACK.SERVER : FALLBACK.NO_DEPARTMENT };
  }

  const fresh = await getSkill(skillId);
  if (!fresh.ok) {
    return {
      error: fresh.reason === "ERROR" ? FALLBACK.SERVER : FALLBACK.SKILL_UNAVAILABLE,
    };
  }
  if (!fresh.value.active) {
    return { error: FALLBACK.INACTIVE_SKILL };
  }

  const linked = await linkSkillToCurrentDepartment(skillId);
  if (!linked.ok) {
    return { error: messageFor("skill", linked.status, linked.detail) };
  }

  refreshCatalogue(skillId);

  return { done: `${fresh.value.name} is now linked to ${department.value.name}.` };
}

/**
 * Unlinking the caller's own department.
 *
 * Works on a retired skill too, so deactivating one never traps a department in a
 * relationship it cannot end. Unlinking something already unlinked is a success.
 */
export async function unlinkSkillFromCurrentDepartmentAction(
  _previous: SkillAdminActionState,
  formData: FormData,
): Promise<SkillAdminActionState> {
  if (!(await requireDepartmentManager())) return { error: FALLBACK.FORBIDDEN };

  const skillId = formData.get("skillId");
  if (typeof skillId !== "string" || !UUID.test(skillId)) {
    return { error: FALLBACK.SKILL_UNAVAILABLE };
  }

  const department = await getManagedDepartment();
  if (!department.ok) {
    return { error: department.reason === "ERROR" ? FALLBACK.SERVER : FALLBACK.NO_DEPARTMENT };
  }

  const unlinked = await unlinkSkillFromCurrentDepartment(skillId);
  if (!unlinked.ok) {
    return { error: messageFor("skill", unlinked.status, unlinked.detail) };
  }

  refreshCatalogue(skillId);

  return { done: `No longer linked to ${department.value.name}.` };
}
