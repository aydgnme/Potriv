import type { SkillExperienceCode, SkillLevelCode } from "./skillVocabulary";

/**
 * What the Skills endpoints actually return.
 *
 * Two things live in this domain and they are not the same thing:
 *
 * - a **catalogue skill** is the organization's shared vocabulary, identified by
 *   `skillId`;
 * - an **employee skill** is one person's declared assignment to that vocabulary,
 *   identified by `employeeSkillId`.
 *
 * Their lifecycles differ — a catalogue skill can be deactivated while somebody's
 * assignment to it survives — and the mutation routes take the *assignment* id.
 * Confusing the two would let a request aimed at a profile row act on shared
 * organization data, so the types keep them apart.
 *
 * Nothing here carries an endorsement, a rating, a holder count or a Team Finder
 * score. No endpoint returns any of them.
 */

export type SkillCategoryRef = {
  readonly categoryId: string;
  readonly name: string;
};

export type SkillCategory = {
  readonly categoryId: string;
  readonly name: string;
  readonly active: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type SkillAuthorRef = {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
};

export type SkillDepartmentRef = {
  readonly departmentId: string;
  readonly name: string;
};

/** `GET /skills` and `GET /skills/{id}` — the catalogue entry. */
export type CatalogueSkill = {
  readonly skillId: string;
  readonly category: SkillCategoryRef;
  readonly name: string;
  readonly description: string | null;
  readonly author: SkillAuthorRef;
  /**
   * Linked departments, already embedded here.
   *
   * Catalogue metadata, and deliberately *not* an eligibility rule: the backend's
   * assign path never consults it, so a skill linked to no department can still
   * be added to a profile.
   */
  readonly departments: readonly SkillDepartmentRef[];
  readonly active: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

/** `GET /me/skills` — one person's own declared assignment. */
export type EmployeeSkill = {
  readonly employeeSkillId: string;
  readonly skill: {
    readonly skillId: string;
    readonly name: string;
    readonly active: boolean;
    readonly category: SkillCategoryRef;
  };
  readonly level: {
    readonly code: SkillLevelCode;
    readonly value: number;
    readonly label: string;
  };
  readonly experience: {
    readonly code: SkillExperienceCode;
    readonly label: string;
  };
  readonly createdAt: string;
  readonly updatedAt: string;
};
