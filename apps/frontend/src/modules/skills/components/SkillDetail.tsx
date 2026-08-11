"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";

import { EMPTY_SKILL_PROFILE_STATE } from "../model/skillsActionState";
import type { CatalogueSkill, EmployeeSkill } from "../model/skillsData";
import { SKILL_EXPERIENCES, SKILL_LEVELS } from "../model/skillVocabulary";
import { assignOwnSkillAction } from "../server/actions/skillProfileActions";

import styles from "./Skills.module.css";

export type SkillDetailProps = {
  readonly skill: CatalogueSkill;
  /** The reader's own assignment to this skill, when they have one. */
  readonly assignment: EmployeeSkill | null;
  /** False when the profile read failed — unknown, not "not assigned". */
  readonly profileLoaded: boolean;
};

/**
 * One catalogue entry, and what the reader can do about it.
 *
 * The department links come from this response and are shown as what they are:
 * metadata about where the skill is used. They are not a permission — the backend
 * lets anyone in the organization add any active skill, so a skill linked to no
 * department is still addable, and filtering the action by department would
 * invent a rule that does not exist.
 *
 * Nothing here counts how many people hold the skill or how good they are at it.
 * No endpoint answers either question.
 */
export function SkillDetail({ skill, assignment, profileLoaded }: SkillDetailProps) {
  return (
    <div className={styles.page}>
      <section className={styles.panel} aria-labelledby="skill-summary">
        <h2 className={styles.panelHeading} id="skill-summary">
          Skill
        </h2>

        {!skill.active ? (
          <Alert tone="warning">
            This catalogue skill is inactive. It stays visible, and anybody who already has it
            keeps it, but it cannot be newly added.
          </Alert>
        ) : null}

        {skill.description ? <p>{skill.description}</p> : null}

        <dl className={styles.figures}>
          <div className={styles.figureRow}>
            <dt>Category</dt>
            <dd>{skill.category.name}</dd>
          </div>
          <div className={styles.figureRow}>
            <dt>Authored by</dt>
            <dd>{skill.author.name}</dd>
          </div>
          <div className={styles.figureRow}>
            <dt>Departments</dt>
            <dd>
              {skill.departments.length === 0
                ? "Not linked to a department"
                : skill.departments.map((department) => department.name).join(", ")}
            </dd>
          </div>
        </dl>

        {skill.departments.length > 0 ? (
          <p className={styles.panelNote}>
            Department links describe where this skill is used. Anyone in the organization can
            add it.
          </p>
        ) : null}
      </section>

      <SelfAssignment skill={skill} assignment={assignment} profileLoaded={profileLoaded} />
    </div>
  );
}

/**
 * The four states this can be in.
 *
 * Active and unassigned is the only one that offers a form. Assigned says so and
 * points at the profile rather than letting somebody submit a duplicate on
 * purpose. Inactive and unassigned explains why there is no form. And when the
 * profile could not be read at all, the action is withheld rather than guessed —
 * offering Add on an unknown state is how duplicates get created.
 */
function SelfAssignment({
  skill,
  assignment,
  profileLoaded,
}: {
  readonly skill: CatalogueSkill;
  readonly assignment: EmployeeSkill | null;
  readonly profileLoaded: boolean;
}) {
  return (
    <section className={styles.panel} aria-labelledby="skill-profile">
      <h2 className={styles.panelHeading} id="skill-profile">
        Your skills
      </h2>

      {!profileLoaded ? (
        <>
          <p className={styles.panelNote}>Could not load your skill-profile state.</p>
          <Link href={`/skills/${skill.skillId}`}>Try again</Link>
        </>
      ) : assignment ? (
        <>
          <p>
            <strong>In my skills</strong>
            {` — ${assignment.level.label}, ${assignment.experience.label}.`}
          </p>
          <Link href="/skills/my">Manage in My skills</Link>
        </>
      ) : skill.active ? (
        <AddToMySkills skill={skill} />
      ) : (
        <p className={styles.panelNote}>
          This catalogue skill is inactive and cannot be newly added.
        </p>
      )}
    </section>
  );
}

/**
 * Choosing a level and an experience.
 *
 * Neither field is pre-selected. A default would put a self-assessment in
 * somebody's profile that they never made, and "Does, 1-2 years" arriving because
 * it was first in a list is not a claim they should have to notice and correct.
 */
function AddToMySkills({ skill }: { readonly skill: CatalogueSkill }) {
  const [state, formAction, isPending] = useActionState(
    assignOwnSkillAction,
    EMPTY_SKILL_PROFILE_STATE,
  );
  const [level, setLevel] = useState("");
  const [experience, setExperience] = useState("");

  return (
    <form action={formAction} className={styles.filters}>
      {state.error ? (
        <Alert tone="danger" title="Not added">
          {state.error}
        </Alert>
      ) : null}
      {state.done ? <Alert tone="success">{state.done}</Alert> : null}

      <input type="hidden" name="skillId" value={skill.skillId} />

      <div className={styles.filterRow}>
        <div className={styles.selectField}>
          <label className={styles.fieldLabel} htmlFor="add-level">
            Level
          </label>
          <select
            id="add-level"
            name="level"
            className={styles.control}
            value={level}
            onChange={(event) => setLevel(event.target.value)}
          >
            <option value="">Choose a level</option>
            {SKILL_LEVELS.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.selectField}>
          <label className={styles.fieldLabel} htmlFor="add-experience">
            Experience
          </label>
          <select
            id="add-experience"
            name="experience"
            className={styles.control}
            value={experience}
            onChange={(event) => setExperience(event.target.value)}
          >
            <option value="">Choose an experience</option>
            {SKILL_EXPERIENCES.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <Button
          type="submit"
          variant="primary"
          loading={isPending}
          disabled={level === "" || experience === ""}
        >
          Add to my skills
        </Button>
      </div>

      {/* Says what these fields are for, without claiming they change matching. */}
      <p className={styles.panelNote}>
        Level and experience describe your self-reported skill profile.
      </p>
    </form>
  );
}
