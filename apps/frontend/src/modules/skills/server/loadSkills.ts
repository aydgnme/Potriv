import "server-only";

import {
  normalizeCatalogueQuery,
  readCatalogueMode,
  type CatalogueQuery,
  type RawSearchParams,
} from "../model/catalogueQuery";
import type { CatalogueSkill, EmployeeSkill, SkillCategory } from "../model/skillsData";

import {
  getOwnSkills,
  getSkill,
  getSkillCategories,
  getSkills,
  type Loaded,
} from "./skillsDataSources";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What each Skills screen needs.
 *
 * The catalogue loads in two steps on purpose, rather than in parallel: the
 * category filter can only be settled against the categories this organization
 * actually has, under the mode being asked for. Fetching both at once would mean
 * either sending an unvalidated category to the search or rendering a filter that
 * disagrees with the request that was made.
 */

export type CatalogueState =
  | {
      readonly kind: "ready";
      readonly query: CatalogueQuery;
      readonly categories: readonly SkillCategory[];
      readonly skills: Loaded<readonly CatalogueSkill[]>;
    }
  | { readonly kind: "error" };

export async function loadCatalogue(params: RawSearchParams): Promise<CatalogueState> {
  const mode = readCatalogueMode(params);

  const categories = await getSkillCategories(mode.includeInactive);
  if (!categories.ok) {
    // Without the categories nothing can honestly say what was filtered, so the
    // screen reports a failure rather than a list that might be narrowed.
    return { kind: "error" };
  }

  const query = normalizeCatalogueQuery(params, categories.value);
  const skills = await getSkills(query);

  return { kind: "ready", query, categories: categories.value, skills };
}

/**
 * The catalogue entry, plus whether the reader already has it.
 *
 * Those are two different questions of two different endpoints, so they are asked
 * together but reported separately: a profile that will not load must not be
 * guessed at as "not assigned", because guessing wrong offers an Add button that
 * creates a duplicate.
 */
export type SkillDetailState =
  | {
      readonly kind: "ready";
      readonly skill: CatalogueSkill;
      /** Null when the profile read failed — unknown, which is not the same as absent. */
      readonly assignment: EmployeeSkill | null;
      readonly profileLoaded: boolean;
    }
  | { readonly kind: "unavailable" }
  | { readonly kind: "error" };

export async function loadSkillDetail(skillId: string): Promise<SkillDetailState> {
  // A malformed id is answered without asking the backend anything.
  if (!UUID.test(skillId)) return { kind: "unavailable" };

  const [skill, own] = await Promise.all([getSkill(skillId), getOwnSkills()]);

  if (!skill.ok) {
    if (skill.reason === "ERROR") return { kind: "error" };
    // 404 and 403 collapse: telling them apart would confirm which ids exist.
    return { kind: "unavailable" };
  }

  if (!own.ok) {
    return { kind: "ready", skill: skill.value, assignment: null, profileLoaded: false };
  }

  const assignment =
    own.value.find((entry) => entry.skill.skillId === skill.value.skillId) ?? null;

  return { kind: "ready", skill: skill.value, assignment, profileLoaded: true };
}

/**
 * The reader's own profile.
 *
 * An empty profile and a failed read are different things and get different
 * screens — "you have not added any skills" is an invitation, and showing it
 * after an outage would be a lie about the state of somebody's own data.
 */
export function loadOwnSkills(): Promise<Loaded<readonly EmployeeSkill[]>> {
  return getOwnSkills();
}
