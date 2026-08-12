"use client";

import { useActionState } from "react";

import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";

import { activeCategories, SKILL_DESCRIPTION_MAX, SKILL_NAME_MAX } from "../model/skillAdmin";
import { EMPTY_SKILL_ADMIN_STATE } from "../model/skillsActionState";
import type { CatalogueSkill, SkillCategory } from "../model/skillsData";
import {
  createCatalogueSkillAction,
  updateCatalogueSkillAction,
} from "../server/actions/skillAdminActions";

import styles from "./Skills.module.css";

export type SkillEditorProps = {
  readonly categories: readonly SkillCategory[];
  /** Absent when creating. */
  readonly skill?: CatalogueSkill;
};

/**
 * Writing a catalogue skill.
 *
 * One form for create and edit; the rules are identical and only the action and
 * the id differ.
 *
 * Only active categories are offered, because the backend refuses a skill in a
 * retired one. An existing skill whose category was retired afterwards is a real
 * state — it keeps rendering everywhere else — but it cannot stay there through an
 * edit, so the current value is shown as a choice that has to be replaced rather
 * than silently substituted.
 *
 * Uniqueness is per category, so the same name under a different category is
 * legitimate. Nothing here predicts it; a 409 comes back into the form with the
 * values intact.
 */
export function SkillEditor({ categories, skill }: SkillEditorProps) {
  const [state, formAction, isPending] = useActionState(
    skill ? updateCatalogueSkillAction : createCatalogueSkillAction,
    EMPTY_SKILL_ADMIN_STATE,
  );

  const selectable = activeCategories(categories);
  const currentCategoryRetired =
    skill !== undefined &&
    !selectable.some((category) => category.categoryId === skill.category.categoryId);

  return (
    <form action={formAction} className={styles.filters}>
      {state.error ? (
        <Alert tone="danger" title={skill ? "Not saved" : "Not created"}>
          {state.error}
        </Alert>
      ) : null}
      {state.done ? <Alert tone="success">{state.done}</Alert> : null}

      {skill ? <input type="hidden" name="skillId" value={skill.skillId} /> : null}

      {currentCategoryRetired ? (
        <Alert tone="warning">
          {`${skill?.category.name} is retired. Choose an active category before saving.`}
        </Alert>
      ) : null}

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="skill-category">
          Category
        </label>
        <select
          id="skill-category"
          name="categoryId"
          className={styles.control}
          defaultValue={
            state.categoryId ?? (currentCategoryRetired ? "" : skill?.category.categoryId ?? "")
          }
          aria-describedby={state.fieldErrors?.categoryId ? "skill-category-error" : undefined}
          aria-invalid={state.fieldErrors?.categoryId ? true : undefined}
        >
          <option value="">Choose a category</option>
          {selectable.map((category) => (
            <option key={category.categoryId} value={category.categoryId}>
              {category.name}
            </option>
          ))}
        </select>
        {state.fieldErrors?.categoryId ? (
          <p id="skill-category-error" className={styles.fieldError}>
            {state.fieldErrors.categoryId}
          </p>
        ) : null}
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="skill-name">
          Name
        </label>
        <input
          id="skill-name"
          name="name"
          className={styles.control}
          maxLength={SKILL_NAME_MAX}
          defaultValue={state.name ?? skill?.name ?? ""}
          aria-describedby={state.fieldErrors?.name ? "skill-name-error" : undefined}
          aria-invalid={state.fieldErrors?.name ? true : undefined}
        />
        {state.fieldErrors?.name ? (
          <p id="skill-name-error" className={styles.fieldError}>
            {state.fieldErrors.name}
          </p>
        ) : null}
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="skill-description">
          Description
        </label>
        <textarea
          id="skill-description"
          name="description"
          className={`${styles.control} ${styles.textarea}`}
          maxLength={SKILL_DESCRIPTION_MAX}
          defaultValue={state.description ?? skill?.description ?? ""}
          aria-describedby={
            state.fieldErrors?.description ? "skill-description-error" : undefined
          }
          aria-invalid={state.fieldErrors?.description ? true : undefined}
        />
        {state.fieldErrors?.description ? (
          <p id="skill-description-error" className={styles.fieldError}>
            {state.fieldErrors.description}
          </p>
        ) : null}
      </div>

      <div>
        <Button type="submit" variant="primary" loading={isPending}>
          {skill ? "Save skill" : "Add to catalogue"}
        </Button>
      </div>

      {!skill ? (
        <p className={styles.panelNote}>
          You will be recorded as the author. Only you can change it afterwards.
        </p>
      ) : null}
    </form>
  );
}
