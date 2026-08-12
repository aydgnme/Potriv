import "server-only";

import {
  backendDelete,
  backendGet,
  backendPatch,
  backendPost,
} from "@/modules/auth/server-public";

import type { CatalogueQuery } from "../model/catalogueQuery";
import type { CatalogueSkill, EmployeeSkill, SkillCategory } from "../model/skillsData";
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
