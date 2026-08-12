import "server-only";

import {
  backendDelete,
  backendGet,
  backendPatch,
  backendPost,
} from "@/modules/auth/server-public";

import type { CatalogueQuery } from "../model/catalogueQuery";
import type {
  CatalogueSkill,
  EmployeeSkill,
  ManagedDepartment,
  SkillCategory,
} from "../model/skillsData";
import type { SkillExperienceCode, SkillLevelCode } from "../model/skillVocabulary";

/**
 * Every backend call Skills makes, one typed function each.
 *
 * The paths are literals and the query string is assembled here from settled
 * values — the browser chooses `q`, a category and a mode, and never a path, a
 * method or a host.
 *
 * Only the shared reads and the caller's own profile writes exist in this file.
 * The catalogue's own management endpoints — creating skills and categories,
 * linking departments — are deliberately absent: they belong to a later task, and
 * a data source nobody calls is the easiest thing in the world to start calling.
 */

export type LoadFailure = "FORBIDDEN" | "NOT_FOUND" | "ERROR";

export type Loaded<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: LoadFailure };

function failureFor(status: number): LoadFailure {
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  return "ERROR";
}

async function load<T>(path: string): Promise<Loaded<T>> {
  const outcome = await backendGet<T>(path);
  if (outcome.ok) return { ok: true, value: outcome.value };
  return { ok: false, reason: failureFor(outcome.error.status) };
}

export type MutationOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly status: number; readonly detail: string | null };

/** `GET /skill-categories` — name ascending, active-only unless asked otherwise. */
export function getSkillCategories(
  includeInactive: boolean,
): Promise<Loaded<readonly SkillCategory[]>> {
  const search = new URLSearchParams({ includeInactive: String(includeInactive) });
  return load<readonly SkillCategory[]>(`/skill-categories?${search.toString()}`);
}

/**
 * `GET /skills` — the product's only server-side text search.
 *
 * `q` is a case-insensitive *contains* match on the skill name, nothing more: not
 * fuzzy, not semantic, and not across descriptions or authors. Blank matches
 * everything, so it is omitted rather than sent empty.
 *
 * Results come back ordered by category name then skill name, and are passed on
 * in that order.
 */
export function getSkills(query: CatalogueQuery): Promise<Loaded<readonly CatalogueSkill[]>> {
  const search = new URLSearchParams({ includeInactive: String(query.includeInactive) });
  if (query.q) search.set("q", query.q);
  if (query.categoryId) search.set("categoryId", query.categoryId);

  return load<readonly CatalogueSkill[]>(`/skills?${search.toString()}`);
}

/** `GET /skills/{skillId}` — 404 covers both missing and another organization's. */
export function getSkill(skillId: string): Promise<Loaded<CatalogueSkill>> {
  return load<CatalogueSkill>(`/skills/${encodeURIComponent(skillId)}`);
}

/** `GET /me/skills` — self-scoped; there is no id in the path and no other person's. */
export function getOwnSkills(): Promise<Loaded<readonly EmployeeSkill[]>> {
  return load<readonly EmployeeSkill[]>("/me/skills");
}

/** `POST /me/skills` — 201. The body is a catalogue id and the two self-reported fields. */
export async function assignOwnSkill(
  skillId: string,
  level: SkillLevelCode,
  experience: SkillExperienceCode,
): Promise<MutationOutcome<EmployeeSkill>> {
  const outcome = await backendPost<EmployeeSkill>("/me/skills", {
    skillId,
    level,
    experience,
  });
  if (outcome.ok) return { ok: true, value: outcome.value };
  return { ok: false, status: outcome.error.status, detail: outcome.error.detail };
}

/**
 * `PATCH /me/skills/{employeeSkillId}` — the **assignment** id, not the skill's.
 *
 * Both mutable fields are sent together: they describe one self-assessment, and
 * saving half of it would record a combination the person never chose. The skill
 * and the owner are immutable and are not in the body at all.
 */
export async function updateOwnSkill(
  employeeSkillId: string,
  level: SkillLevelCode,
  experience: SkillExperienceCode,
): Promise<MutationOutcome<EmployeeSkill>> {
  const outcome = await backendPatch<EmployeeSkill>(
    `/me/skills/${encodeURIComponent(employeeSkillId)}`,
    { level, experience },
  );
  if (outcome.ok) return { ok: true, value: outcome.value };
  return { ok: false, status: outcome.error.status, detail: outcome.error.detail };
}

/**
 * `DELETE /me/skills/{employeeSkillId}` — 204.
 *
 * Removes one row from one profile. The catalogue skill, its category and every
 * other person's assignment to it are untouched.
 */
export async function removeOwnSkill(
  employeeSkillId: string,
): Promise<MutationOutcome<void>> {
  const outcome = await backendDelete(`/me/skills/${encodeURIComponent(employeeSkillId)}`);
  if (outcome.ok) return { ok: true, value: undefined };
  return { ok: false, status: outcome.error.status, detail: outcome.error.detail };
}

/* ── Catalogue administration ──────────────────────────────────────────────
 *
 * Three different authorities live below, and they are deliberately not one:
 *
 * - **Category and skill creation** need the Department Manager role.
 * - **Skill content mutation** additionally needs the caller to be that skill's
 *   author; another manager may read it and must not change it.
 * - **Department links** need an actual manager *appointment*, which the role
 *   alone does not imply — and the endpoint takes no department, because the
 *   backend resolves the caller's own from the principal.
 *
 * Deactivation is soft throughout. Nothing here deletes a category or a skill.
 */

/** `POST /skill-categories` — 201. Department-manager role. */
export async function createSkillCategory(
  name: string,
): Promise<MutationOutcome<SkillCategory>> {
  const outcome = await backendPost<SkillCategory>("/skill-categories", { name });
  if (outcome.ok) return { ok: true, value: outcome.value };
  return { ok: false, status: outcome.error.status, detail: outcome.error.detail };
}

/** `PATCH /skill-categories/{id}` — partial; callers send only what they mean. */
export async function updateSkillCategory(
  categoryId: string,
  changes: { readonly name?: string; readonly active?: boolean },
): Promise<MutationOutcome<SkillCategory>> {
  const outcome = await backendPatch<SkillCategory>(
    `/skill-categories/${encodeURIComponent(categoryId)}`,
    changes,
  );
  if (outcome.ok) return { ok: true, value: outcome.value };
  return { ok: false, status: outcome.error.status, detail: outcome.error.detail };
}

/**
 * `DELETE /skill-categories/{id}` — 204, and **soft**.
 *
 * It deactivates. Skills in the category, their department links and everybody's
 * assignments are untouched, so an active skill can legitimately sit in a
 * deactivated category and the product shows that rather than rewriting it.
 */
export async function deactivateSkillCategory(
  categoryId: string,
): Promise<MutationOutcome<void>> {
  const outcome = await backendDelete(`/skill-categories/${encodeURIComponent(categoryId)}`);
  if (outcome.ok) return { ok: true, value: undefined };
  return { ok: false, status: outcome.error.status, detail: outcome.error.detail };
}

/** `POST /skills` — 201. The backend records the caller as author. */
export async function createCatalogueSkill(
  categoryId: string,
  name: string,
  description: string | null,
): Promise<MutationOutcome<CatalogueSkill>> {
  const outcome = await backendPost<CatalogueSkill>("/skills", {
    categoryId,
    name,
    description,
  });
  if (outcome.ok) return { ok: true, value: outcome.value };
  return { ok: false, status: outcome.error.status, detail: outcome.error.detail };
}

/** `PATCH /skills/{id}` — partial. Author only; 403 otherwise. */
export async function updateCatalogueSkill(
  skillId: string,
  changes: {
    readonly categoryId?: string;
    readonly name?: string;
    readonly description?: string | null;
    readonly active?: boolean;
  },
): Promise<MutationOutcome<CatalogueSkill>> {
  const outcome = await backendPatch<CatalogueSkill>(
    `/skills/${encodeURIComponent(skillId)}`,
    changes,
  );
  if (outcome.ok) return { ok: true, value: outcome.value };
  return { ok: false, status: outcome.error.status, detail: outcome.error.detail };
}

/** `DELETE /skills/{id}` — 204, soft, author only. Existing assignments survive. */
export async function deactivateCatalogueSkill(
  skillId: string,
): Promise<MutationOutcome<void>> {
  const outcome = await backendDelete(`/skills/${encodeURIComponent(skillId)}`);
  if (outcome.ok) return { ok: true, value: undefined };
  return { ok: false, status: outcome.error.status, detail: outcome.error.detail };
}

/**
 * `GET /department/projects` — the only endpoint that says which department the
 * caller actually manages.
 *
 * A 403 here is the honest signal that somebody holds the Department Manager role
 * without an appointment: they may author catalogue entries, but they have no
 * department to link one to.
 */
export async function getManagedDepartment(): Promise<Loaded<ManagedDepartment>> {
  const outcome = await load<{ readonly department: ManagedDepartment }>("/department/projects");
  if (!outcome.ok) return outcome;
  return { ok: true, value: outcome.value.department };
}

/**
 * `POST /skills/{id}/departments/current` — links the caller's own department.
 *
 * There is no department in the path or the body by design: the backend resolves
 * it from the authenticated principal, so no browser can aim a link at somebody
 * else's department. Linking twice is an idempotent success.
 */
export async function linkSkillToCurrentDepartment(
  skillId: string,
): Promise<MutationOutcome<void>> {
  const outcome = await backendPost<void>(
    `/skills/${encodeURIComponent(skillId)}/departments/current`,
    {},
  );
  if (outcome.ok) return { ok: true, value: undefined };
  return { ok: false, status: outcome.error.status, detail: outcome.error.detail };
}

/** `DELETE /skills/{id}/departments/current` — 204. Idempotent, and works on inactive skills. */
export async function unlinkSkillFromCurrentDepartment(
  skillId: string,
): Promise<MutationOutcome<void>> {
  const outcome = await backendDelete(
    `/skills/${encodeURIComponent(skillId)}/departments/current`,
  );
  if (outcome.ok) return { ok: true, value: undefined };
  return { ok: false, status: outcome.error.status, detail: outcome.error.detail };
}
