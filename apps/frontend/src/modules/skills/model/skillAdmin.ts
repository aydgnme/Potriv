import type { CatalogueSkill, ManagedDepartment, SkillCategory } from "./skillsData";

/**
 * What a catalogue administrator may do, and to what.
 *
 * Three separate authorities, kept separate because flattening them into "admin"
 * would grant each the reach of the widest:
 *
 * - **Authoring** — any Department Manager may create categories and skills.
 * - **Content** — only the skill's own author may rename, re-describe, retire or
 *   restore it. Another manager reads it and leaves it alone.
 * - **Department links** — need an actual manager *appointment*, not the role.
 *   Somebody holding the role with no department has nothing to link to; somebody
 *   who does manage a department may link it to anyone's skill, because a link
 *   says "we use this here", not "I own this".
 */

export const CATEGORY_NAME_MAX = 120;
export const SKILL_NAME_MAX = 160;
export const SKILL_DESCRIPTION_MAX = 4000;

export type CategoryFormResult =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly error: string };

export function validateCategoryName(raw: string): CategoryFormResult {
  const name = raw.trim();

  if (name.length === 0) return { ok: false, error: "Enter a category name." };
  if (name.length > CATEGORY_NAME_MAX) {
    return { ok: false, error: `Use ${CATEGORY_NAME_MAX} characters or fewer.` };
  }

  return { ok: true, name };
}

export type SkillFormErrors = {
  readonly categoryId?: string;
  readonly name?: string;
  readonly description?: string;
};

export type SkillFormValues = {
  readonly categoryId: string;
  readonly name: string;
  readonly description: string | null;
};

export type SkillFormResult =
  | { readonly ok: true; readonly values: SkillFormValues }
  | { readonly ok: false; readonly errors: SkillFormErrors };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A skill's own fields.
 *
 * Uniqueness is per organization **and category**, so "Java" under Backend and
 * "Java" under Frontend are both allowed and nothing here pretends otherwise —
 * only the backend can answer whether this particular pair is taken.
 */
export function validateSkillForm(
  rawCategoryId: string,
  rawName: string,
  rawDescription: string,
): SkillFormResult {
  const categoryId = rawCategoryId.trim();
  const name = rawName.trim();
  const description = rawDescription.trim();
  const errors: { categoryId?: string; name?: string; description?: string } = {};

  if (!UUID.test(categoryId)) errors.categoryId = "Choose a category.";

  if (name.length === 0) {
    errors.name = "Enter a skill name.";
  } else if (name.length > SKILL_NAME_MAX) {
    errors.name = `Use ${SKILL_NAME_MAX} characters or fewer.`;
  }

  if (description.length > SKILL_DESCRIPTION_MAX) {
    errors.description = `Use ${SKILL_DESCRIPTION_MAX} characters or fewer.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    values: { categoryId, name, description: description === "" ? null : description },
  };
}

/** Only an active category may take a new or moved skill. */
export function activeCategories(
  categories: readonly SkillCategory[],
): readonly SkillCategory[] {
  return categories.filter((category) => category.active);
}

/**
 * The categories an existing skill may be saved into.
 *
 * The active ones, plus the skill's own even when it has been retired. That
 * follows the backend, which only requires an active category when the skill is
 * actually *moving*: staying put while renaming or re-describing is allowed.
 *
 * It also follows from category retirement not cascading. A skill can legitimately
 * live in a retired category, and dropping that category from the picker would
 * show the state while denying the author any way to edit around it — forcing a
 * move nobody asked for as the price of fixing a typo.
 */
export function categoriesForEdit(
  categories: readonly SkillCategory[],
  currentCategoryId: string,
): readonly SkillCategory[] {
  return categories.filter(
    (category) => category.active || category.categoryId === currentCategoryId,
  );
}

/**
 * Whether a save needs its target category to be active.
 *
 * Only a move does. Keeping the current category — retired or not — is the case
 * the backend permits and the one an author needs.
 */
export function requiresActiveCategory(
  currentCategoryId: string,
  targetCategoryId: string,
): boolean {
  return targetCategoryId !== currentCategoryId;
}

export type SkillAdminCapabilities = {
  /** Any department manager may create catalogue entries. */
  readonly canAuthorCatalogue: boolean;
  /** Only this skill's author may change its content or its state. */
  readonly canEditContent: boolean;
  /** Requires an actual appointment, and says which department it would affect. */
  readonly managedDepartment: ManagedDepartment | null;
  /** True when the managed department is already among the skill's links. */
  readonly linkedToManagedDepartment: boolean;
};

export type SkillAdminInput = {
  readonly skill: CatalogueSkill;
  readonly currentUserId: string;
  readonly roles: readonly string[];
  /** Null when the caller holds the role but manages no department. */
  readonly managedDepartment: ManagedDepartment | null;
};

export function skillAdminCapabilities(input: SkillAdminInput): SkillAdminCapabilities {
  const isDepartmentManager = input.roles.includes("DEPARTMENT_MANAGER");
  const managedDepartment = isDepartmentManager ? input.managedDepartment : null;

  return {
    canAuthorCatalogue: isDepartmentManager,
    // Authorship, not role, decides content — and it is re-checked server-side
    // against a fresh read before anything is written.
    canEditContent: isDepartmentManager && input.skill.author.userId === input.currentUserId,
    managedDepartment,
    linkedToManagedDepartment:
      managedDepartment !== null &&
      input.skill.departments.some(
        (department) => department.departmentId === managedDepartment.departmentId,
      ),
  };
}

/**
 * Whether a link control should be offered, and which one.
 *
 * An inactive skill cannot take a *new* link — the backend refuses — but an
 * existing one can still be removed, so retiring a skill never traps a department
 * into a relationship it cannot end.
 */
export type LinkAction = "link" | "unlink" | "none";

export function linkActionFor(
  skill: CatalogueSkill,
  capabilities: SkillAdminCapabilities,
): LinkAction {
  if (capabilities.managedDepartment === null) return "none";
  if (capabilities.linkedToManagedDepartment) return "unlink";
  return skill.active ? "link" : "none";
}
