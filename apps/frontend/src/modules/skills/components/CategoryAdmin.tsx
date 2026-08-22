"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";

import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";
import { EmptyState } from "@/shared/ui/EmptyState";
import { formatDate } from "@/shared/utils/formatDate";

import { CATEGORY_NAME_MAX } from "../model/skillAdmin";
import { EMPTY_SKILL_ADMIN_STATE } from "../model/skillsActionState";
import type { SkillCategory } from "../model/skillsData";
import {
  createSkillCategoryAction,
  deactivateSkillCategoryAction,
  reactivateSkillCategoryAction,
  updateSkillCategoryAction,
} from "../server/actions/skillAdminActions";

import styles from "./Skills.module.css";

export type CategoryAdminProps = {
  readonly categories: readonly SkillCategory[];
  readonly includeInactive: boolean;
};

/**
 * The catalogue's categories.
 *
 * Department-manager work. Retiring is soft and stops at the category: the skills
 * inside it keep their own state, their department links and everybody's
 * assignments, so an active skill can legitimately sit in a retired category.
 * The confirmation says so, because "deactivate the category" reads like it might
 * take the skills with it.
 */
export function CategoryAdmin({ categories, includeInactive }: CategoryAdminProps) {
  return (
    <div className={styles.section}>
      <CreateCategoryForm />

      <div className={styles.filterRow}>
        <Link
          href={
            includeInactive ? "/skills/categories" : "/skills/categories?includeInactive=true"
          }
        >
          {includeInactive ? "Hide retired" : "Show retired"}
        </Link>
      </div>

      {categories.length === 0 ? (
        <EmptyState
          title="No categories yet."
          description="Every skill belongs to a category."
        />
      ) : (
        <ul className={styles.skillList}>
          {categories.map((category) => (
            <li key={category.categoryId}>
              <CategoryRow category={category} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateCategoryForm() {
  const [state, formAction, isPending] = useActionState(
    createSkillCategoryAction,
    EMPTY_SKILL_ADMIN_STATE,
  );

  return (
    <form action={formAction} className={styles.filters}>
      {state.error ? (
        <Alert tone="danger" title="Not created">
          {state.error}
        </Alert>
      ) : null}
      {state.done ? <Alert tone="success">{state.done}</Alert> : null}

      <div className={styles.filterRow}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="new-category-name">
            Category name
          </label>
          <input
            id="new-category-name"
            name="name"
            className={styles.control}
            maxLength={CATEGORY_NAME_MAX}
            defaultValue={state.name ?? ""}
            aria-describedby={state.fieldErrors?.name ? "new-category-error" : undefined}
            aria-invalid={state.fieldErrors?.name ? true : undefined}
          />
          {state.fieldErrors?.name ? (
            <p id="new-category-error" className={styles.fieldError}>
              {state.fieldErrors.name}
            </p>
          ) : null}
        </div>

        <Button type="submit" variant="primary" loading={isPending}>
          New category
        </Button>
      </div>
    </form>
  );
}

function CategoryRow({ category }: { readonly category: SkillCategory }) {
  const [renameState, renameAction, isRenaming] = useActionState(
    updateSkillCategoryAction,
    EMPTY_SKILL_ADMIN_STATE,
  );
  const [retireState, retireAction, isRetiring] = useActionState(
    deactivateSkillCategoryAction,
    EMPTY_SKILL_ADMIN_STATE,
  );
  const [restoreState, restoreAction, isRestoring] = useActionState(
    reactivateSkillCategoryAction,
    EMPTY_SKILL_ADMIN_STATE,
  );
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameId = `category-name-${category.categoryId}`;
  const titleId = `retire-category-${category.categoryId}`;

  // Only the message that agrees with the state as it is now.
  const confirmation = category.active ? restoreState.done : retireState.done;

  return (
    <div className={styles.assignment}>
      <div className={styles.assignmentMain}>
        <span className={styles.skillMeta}>
          {category.active ? (
            <span className={styles.muted}>Available</span>
          ) : (
            <span className={styles.inactiveTag}>Retired</span>
          )}
          <span className={styles.muted}>
            {formatDate(category.updatedAt) ?? "Not recorded"}
          </span>
        </span>

        {renameState.error ? <p className={styles.fieldError}>{renameState.error}</p> : null}
        {retireState.error ? <p className={styles.fieldError}>{retireState.error}</p> : null}
        {restoreState.error ? <p className={styles.fieldError}>{restoreState.error}</p> : null}
        {renameState.done ? <p className={styles.panelNote}>{renameState.done}</p> : null}
        {confirmation ? <p className={styles.panelNote}>{confirmation}</p> : null}
      </div>

      <form action={renameAction} className={styles.assignmentControls}>
        <input type="hidden" name="categoryId" value={category.categoryId} />
        <div className={styles.selectField}>
          <label className={styles.fieldLabel} htmlFor={nameId}>
            Name
          </label>
          <input
            id={nameId}
            name="name"
            className={styles.control}
            maxLength={CATEGORY_NAME_MAX}
            aria-label={`${category.name} name`}
            defaultValue={category.name}
          />
        </div>
        <Button
          type="submit"
          variant="secondary"
          loading={isRenaming}
          aria-label={`Save ${category.name}`}
        >
          Save
        </Button>
      </form>

      <div>
        {category.active ? (
          <>
            {/*
              A category name is bounded at 120 characters, which is still far
              wider than a mobile control — one long name pushed the whole page
              sideways at every width below 768px. Keeping it out of the visible
              label fixes that.

              The accessible name **starts with the visible label** so the two
              agree: WCAG 2.5.3 requires the visible text to be contained in the
              accessible name, and speech-input users say what they can see.
            */}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => dialogRef.current?.showModal()}
              loading={isRetiring}
              aria-label={`Retire category: ${category.name}`}
            >
              Retire category
            </Button>

            <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={titleId}>
              <h2 id={titleId} className={styles.panelHeading}>
                {`Retire ${category.name}?`}
              </h2>
              <div className={styles.dialogBody}>
                <p className={styles.panelNote}>
                  New skills cannot be created in it, and it stops appearing as a choice.
                </p>
                {/* The part people assume wrongly. */}
                <p className={styles.panelNote}>
                  The skills already in it are unchanged. They keep their own state, their
                  department links, and everyone&rsquo;s existing skill profiles.
                </p>
              </div>

              <form action={retireAction}>
                <input type="hidden" name="categoryId" value={category.categoryId} />
                <div className={styles.dialogActions}>
                  <Button variant="secondary" onClick={() => dialogRef.current?.close()}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="danger"
                    onClick={() => dialogRef.current?.close()}
                  >
                    Retire category
                  </Button>
                </div>
              </form>
            </dialog>
          </>
        ) : (
          <form action={restoreAction}>
            <input type="hidden" name="categoryId" value={category.categoryId} />
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              loading={isRestoring}
              aria-label={`Restore category: ${category.name}`}
            >
              Restore category
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
