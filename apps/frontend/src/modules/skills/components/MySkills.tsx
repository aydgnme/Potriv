"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";

import { ActionFeedback, useLatestOutcome } from "@/shared/ui/ActionFeedback";
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
    /* Compact and comparable. Level and experience are self-reported context —
       never a rating — so they are plain selects in columns, with no stars, bars
       or score anywhere near them. */
    <table className={styles.mySkillsTable}>
      <thead>
        <tr>
          <th scope="col">Skill</th>
          <th scope="col">Category</th>
          <th scope="col">Level</th>
          <th scope="col">Experience</th>
          <th scope="col">Actions</th>
        </tr>
      </thead>
      <tbody>
        {assignments.map((assignment) => (
          <AssignmentRow key={assignment.employeeSkillId} assignment={assignment} />
        ))}
      </tbody>
    </table>
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
  /*
    A <form> cannot wrap the children of a <tr>, so the form lives in the last
    cell and the controls join it by id. That is the standard association, and it
    keeps one row = one submission without breaking table semantics.
  */
  const formId = `save-${assignment.employeeSkillId}`;
  const latest = useLatestOutcome([state, removeState]);

  return (
    <tr>
      <th scope="row" className={styles.skillCell}>
        <Link href={`/skills/${assignment.skill.skillId}`} className={styles.skillName}>
          {assignment.skill.name}
        </Link>
        {!assignment.skill.active ? (
          /* The catalogue entry was retired; this assignment is still real and
             is not removed by that. */
          <span className={styles.inactiveTag}>Inactive catalogue skill</span>
        ) : null}
        {/* Save and remove are separate actions on one row. Only the newer of
            them is feedback — a save failure must not sit beside a later remove
            failure, and neither may linger past a later success. */}
        <ActionFeedback
          outcome={latest.outcome}
          revision={latest.revision}
          errorClassName={styles.fieldError}
          doneClassName={styles.panelNote}
        />
      </th>

      <td data-label="Category" className={styles.muted}>
        {assignment.skill.category.name}
      </td>

      <td data-label="Level">
        {/* The visible word is short, but the accessible name carries the skill
            — otherwise a screen reader hears "Level" a dozen times in a row with
            nothing to tell the rows apart. */}
        <label className="p-visually-hidden" htmlFor={levelId}>
          {`${assignment.skill.name} level`}
        </label>
        <select
          id={levelId}
          name="level"
          form={formId}
          className={styles.control}
          defaultValue={assignment.level.code}
        >
          {SKILL_LEVELS.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </select>
      </td>

      <td data-label="Experience">
        <label className="p-visually-hidden" htmlFor={experienceId}>
          {`${assignment.skill.name} experience`}
        </label>
        <select
          id={experienceId}
          name="experience"
          form={formId}
          className={styles.control}
          defaultValue={assignment.experience.code}
        >
          {SKILL_EXPERIENCES.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </select>
      </td>

      <td data-label="Actions" className={styles.assignmentActions}>
        <form action={formAction} id={formId}>
          <input type="hidden" name="employeeSkillId" value={assignment.employeeSkillId} />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
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
      </td>
    </tr>
  );
}

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
