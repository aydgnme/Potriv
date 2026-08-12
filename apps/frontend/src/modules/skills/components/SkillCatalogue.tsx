import Link from "next/link";

import { EmptyState } from "@/shared/ui/EmptyState";

import { catalogueHref, isFiltered, type CatalogueQuery } from "../model/catalogueQuery";
import type { CatalogueSkill, SkillCategory } from "../model/skillsData";

import styles from "./Skills.module.css";

export type SkillCatalogueProps = {
  readonly query: CatalogueQuery;
  readonly categories: readonly SkillCategory[];
  readonly skills: readonly CatalogueSkill[];
};

/**
 * The organization's shared skill vocabulary.
 *
 * Every filter is a link or a plain form submission, so the result is always the
 * backend's answer to the URL currently in the address bar. That is the whole
 * design: `q` is the product's only server-side search, and re-implementing it
 * over a preloaded list would make the screen disagree with its own URL the
 * moment the two drifted.
 *
 * The order is the backend's — category name, then skill name. There is no
 * ranking to sort by and no pagination to page through, so the count says exactly
 * what was returned and implies no hidden remainder.
 *
 * There are no catalogue-management controls here for anyone, including
 * department managers who can create skills through the API. Those arrive with
 * the rest of that workflow; a button that half-worked would be worse than none.
 */
export function SkillCatalogue({ query, categories, skills }: SkillCatalogueProps) {
  const filtered = isFiltered(query);

  return (
    <div className={styles.catalogue}>
      <nav className={styles.categoryNav} aria-label="Skill categories">
        <p className={styles.categoryHeading}>Categories</p>

        <Link
          href={catalogueHref({ ...query, categoryId: undefined })}
          className={styles.categoryLink}
          aria-current={query.categoryId === undefined ? "true" : undefined}
        >
          All skills
        </Link>

        {categories.map((category) => (
          <Link
            key={category.categoryId}
            href={catalogueHref({ ...query, categoryId: category.categoryId })}
            className={styles.categoryLink}
            aria-current={query.categoryId === category.categoryId ? "true" : undefined}
          >
            {category.name}
            {/* Only meaningful when inactive categories were actually requested. */}
            {!category.active ? <span className={styles.inactiveTag}> · Inactive</span> : null}
          </Link>
        ))}
      </nav>

      <div className={styles.section}>
        <CatalogueFilters query={query} />

        <p className={styles.resultCount} role="status">
          {countLabel(skills.length, filtered)}
        </p>

        {skills.length === 0 ? (
          filtered ? (
            // "Clear filters" sits in the filter row directly above, where the
            // filters themselves are; repeating it here put the same link on
            // screen twice.
            <EmptyState
              title={query.q ? `No skills match “${query.q}”.` : "No skills match these filters."}
            />
          ) : (
            // No "Create skill" here: this task does not ship catalogue
            // management, and offering it would be a dead end.
            <EmptyState title="No skills have been added yet." />
          )
        ) : (
          <ul className={styles.skillList}>
            {skills.map((skill) => (
              <li key={skill.skillId} className={styles.skillRow}>
                <span className={styles.skillMain}>
                  <Link href={`/skills/${skill.skillId}`} className={styles.skillName}>
                    {skill.name}
                  </Link>
                  <span className={styles.skillMeta}>
                    <span className={styles.muted}>{skill.category.name}</span>
                    {!skill.active ? (
                      <span className={styles.inactiveTag}>Inactive</span>
                    ) : null}
                  </span>
                  {skill.description ? (
                    <span className={styles.skillDescription}>{skill.description}</span>
                  ) : null}
                </span>

                {skill.departments.length > 0 ? (
                  <ul className={styles.chipList} aria-label={`Departments using ${skill.name}`}>
                    {skill.departments.map((department) => (
                      <li key={department.departmentId} className={styles.chip}>
                        {department.name}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Search and mode, as a plain GET form.
 *
 * One submit, one navigation, one backend query — linkable, back-button friendly,
 * and working before any JavaScript loads. Searching on every keystroke would
 * spend a request per character to answer a question nobody finished asking.
 */
function CatalogueFilters({ query }: { readonly query: CatalogueQuery }) {
  return (
    <form method="get" action="/skills" className={styles.filters}>
      {/* The category lives in the sidebar links; it rides along so a search does
          not silently widen the current category. */}
      {query.categoryId ? (
        <input type="hidden" name="categoryId" value={query.categoryId} />
      ) : null}

      <div className={styles.filterRow}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="skill-search">
            Search skills
          </label>
          <input
            id="skill-search"
            name="q"
            type="search"
            className={styles.control}
            defaultValue={query.q ?? ""}
          />
        </div>

        <div className={styles.checkboxField}>
          <input
            id="include-inactive"
            name="includeInactive"
            type="checkbox"
            value="true"
            defaultChecked={query.includeInactive}
          />
          <label htmlFor="include-inactive">Show inactive</label>
        </div>

        <button type="submit" className={styles.control}>
          Search
        </button>

        {isFiltered(query) || query.includeInactive ? (
          <Link href="/skills">Clear filters</Link>
        ) : null}
      </div>

      <p className={styles.panelNote}>
        Search matches skill names. It is not a search of descriptions or people.
      </p>
    </form>
  );
}

/** Honest about what was returned; there is no total beyond it. */
function countLabel(count: number, filtered: boolean): string {
  const noun = count === 1 ? "skill" : "skills";
  return filtered ? `${count} matching ${noun}` : `${count} ${noun}`;
}
