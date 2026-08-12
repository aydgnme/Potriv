"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";

import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";
import { EmptyState } from "@/shared/ui/EmptyState";

import { EMPTY_SKILL_PROFILE_STATE } from "../model/skillsActionState";
import type { EmployeeSkill } from "../model/skillsData";
import { SKILL_EXPERIENCES, SKILL_LEVELS } from "../model/skillVocabulary";
import {
  removeOwnSkillAction,
  updateOwnSkillAction,
} from "../server/actions/skillProfileActions";

import styles from "./Skills.module.css";

export type MySkillsProps = {
  readonly assignments: readonly EmployeeSkill[];
};

/**
 * The reader's own skill profile.
 *
 * In the backend's order — category, then skill name — and not re-sorted by level
 * or experience, which would imply a ranking neither field has.
 *
 * An assignment whose catalogue skill has since been deactivated stays here, and
 * stays editable and removable. Hiding it would strand somebody with a row in
 * their profile they can no longer reach, and it is still their data.
 */
export function MySkills({ assignments }: MySkillsProps) {
  if (assignments.length === 0) {
    return (
      <EmptyState
        title="Your skill profile is empty."
        description="Team Finder matches people to projects using these."
        // Skills are chosen from the shared catalogue; there is no free-text
        // skill to type here, because that is not what the profile holds.
        action={<Link href="/skills">Add a skill</Link>}
      />
    );
  }

  return (
    <ul className={styles.skillList}>
      {assignments.map((assignment) => (
        <li key={assignment.employeeSkillId}>
          <AssignmentRow assignment={assignment} />
        </li>
      ))}
    </ul>
  );
}

/**
 * One assignment, edited in place.
 *
 * Level and experience save together behind one Save: they describe a single
 * self-assessment, and auto-saving each select on change would write a
 * combination the person was half-way through choosing.
 */
function AssignmentRow({ assignment }: { readonly assignment: EmployeeSkill }) {
  const [state, formAction, isPending] = useActionState(
    updateOwnSkillAction,
    EMPTY_SKILL_PROFILE_STATE,
  );
  const [removeState, removeAction, isRemoving] = useActionState(
    removeOwnSkillAction,
    EMPTY_SKILL_PROFILE_STATE,
  );

  const levelId = `level-${assignment.employeeSkillId}`;
  const experienceId = `experience-${assignment.employeeSkillId}`;

  return (
    <div className={styles.assignment}>
      <div className={styles.assignmentMain}>
        <Link href={`/skills/${assignment.skill.skillId}`} className={styles.skillName}>
          {assignment.skill.name}
        </Link>
        <span className={styles.skillMeta}>
          <span className={styles.muted}>{assignment.skill.category.name}</span>
          {!assignment.skill.active ? (
            <span className={styles.inactiveTag}>Inactive catalogue skill</span>
          ) : null}
        </span>

        {state.error ? <p className={styles.fieldError}>{state.error}</p> : null}
        {removeState.error ? <p className={styles.fieldError}>{removeState.error}</p> : null}
        {state.done ? <p className={styles.panelNote}>{state.done}</p> : null}
      </div>

      <form action={formAction} className={styles.assignmentControls}>
        <input type="hidden" name="employeeSkillId" value={assignment.employeeSkillId} />

        <div className={styles.selectField}>
          {/* The visible word is short, but the accessible name carries the skill
              — otherwise a screen reader hears "Level" a dozen times in a row
              with nothing to tell the rows apart. */}
          <label className={styles.fieldLabel} htmlFor={levelId}>
            Level
          </label>
          <select
            id={levelId}
            name="level"
            className={styles.control}
            aria-label={`${assignment.skill.name} level`}
            defaultValue={assignment.level.code}
          >
            {SKILL_LEVELS.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.selectField}>
          <label className={styles.fieldLabel} htmlFor={experienceId}>
            Experience
          </label>
          <select
            id={experienceId}
            name="experience"
            className={styles.control}
            aria-label={`${assignment.skill.name} experience`}
            defaultValue={assignment.experience.code}
          >
            {SKILL_EXPERIENCES.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <Button
          type="submit"
          variant="secondary"
          loading={isPending}
          aria-label={`Save ${assignment.skill.name}`}
        >
          Save
        </Button>
      </form>

      <RemoveAssignmentButton
        assignment={assignment}
        formAction={removeAction}
        isPending={isRemoving}
      />
    </div>
  );
}

/**
 * Removing one row from one profile.
 *
 * The wording avoids "Delete", because the catalogue skill is not going anywhere
 * — only this person's claim to it. And an inactive skill is not currently used
 * for matching, so its confirmation does not pretend otherwise.
 */
function RemoveAssignmentButton({
  assignment,
  formAction,
  isPending,
}: {
  readonly assignment: EmployeeSkill;
  readonly formAction: (formData: FormData) => void;
  readonly isPending: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = `remove-${assignment.employeeSkillId}`;

  return (
    <div>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => dialogRef.current?.showModal()}
        loading={isPending}
      >
        {`Remove ${assignment.skill.name}`}
      </Button>

      <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={titleId}>
        <h2 id={titleId} className={styles.panelHeading}>
          {`Remove ${assignment.skill.name} from your skill profile?`}
        </h2>
        <div className={styles.dialogBody}>
          {assignment.skill.active ? (
            <>
              <p className={styles.panelNote}>This removes only your skill assignment.</p>
              <p className={styles.panelNote}>
                Team Finder will no longer use this skill from your profile when matching you to
                projects.
              </p>
            </>
          ) : (
            <p className={styles.panelNote}>
              This removes only your existing assignment to this inactive catalogue skill.
            </p>
          )}
        </div>

        <form action={formAction}>
          <input type="hidden" name="employeeSkillId" value={assignment.employeeSkillId} />
          <div className={styles.dialogActions}>
            <Button variant="secondary" onClick={() => dialogRef.current?.close()}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" onClick={() => dialogRef.current?.close()}>
              Remove skill
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
