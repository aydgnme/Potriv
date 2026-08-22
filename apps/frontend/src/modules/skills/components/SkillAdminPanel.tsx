"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";

import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";

import { linkActionFor, type SkillAdminCapabilities } from "../model/skillAdmin";
import { EMPTY_SKILL_ADMIN_STATE } from "../model/skillsActionState";
import type { CatalogueSkill } from "../model/skillsData";
import {
  deactivateCatalogueSkillAction,
  linkSkillToCurrentDepartmentAction,
  reactivateCatalogueSkillAction,
  unlinkSkillFromCurrentDepartmentAction,
} from "../server/actions/skillAdminActions";

import styles from "./Skills.module.css";

export type SkillAdminPanelProps = {
  readonly skill: CatalogueSkill;
  readonly capabilities: SkillAdminCapabilities;
};

/**
 * What a department manager may do to this catalogue entry.
 *
 * Two independent capabilities, rendered independently because they come from
 * different facts. Content belongs to the author; the department link belongs to
 * whoever actually manages a department. A manager who wrote nothing here can
 * still link their department, and an author with no department cannot link
 * anything — both are normal, and the panel shows exactly the controls each
 * person has rather than one "admin" block.
 *
 * Nothing rendered here is authority. Every control's action re-reads the skill
 * and re-derives the same facts before it writes.
 */
export function SkillAdminPanel({ skill, capabilities }: SkillAdminPanelProps) {
  if (!capabilities.canAuthorCatalogue) return null;

  return (
    <section className={styles.panel} aria-labelledby="skill-admin">
      <h2 className={styles.panelHeading} id="skill-admin">
        Catalogue
      </h2>

      {capabilities.canEditContent ? (
        <ContentControls skill={skill} />
      ) : (
        <p className={styles.panelNote}>
          {`${skill.author.name} added this skill. Only they can change it.`}
        </p>
      )}

      <DepartmentLinkControls skill={skill} capabilities={capabilities} />
    </section>
  );
}

/** Rename, re-describe, retire, restore — author only. */
function ContentControls({ skill }: { readonly skill: CatalogueSkill }) {
  const [retireState, retireAction, isRetiring] = useActionState(
    deactivateCatalogueSkillAction,
    EMPTY_SKILL_ADMIN_STATE,
  );
  const [restoreState, restoreAction, isRestoring] = useActionState(
    reactivateCatalogueSkillAction,
    EMPTY_SKILL_ADMIN_STATE,
  );
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = `retire-skill-${skill.skillId}`;

  const confirmation = skill.active ? restoreState.done : retireState.done;

  return (
    <>
      {retireState.error ? (
        <Alert tone="danger" title="Not changed">
          {retireState.error}
        </Alert>
      ) : null}
      {restoreState.error ? (
        <Alert tone="danger" title="Not changed">
          {restoreState.error}
        </Alert>
      ) : null}
      {confirmation ? <Alert tone="success">{confirmation}</Alert> : null}

      <div className={styles.filterRow}>
        <Link href={`/skills/${skill.skillId}/edit`}>Edit skill</Link>

        {skill.active ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => dialogRef.current?.showModal()}
            loading={isRetiring}
          >
            Retire skill
          </Button>
        ) : (
          <form action={restoreAction}>
            <input type="hidden" name="skillId" value={skill.skillId} />
            <Button type="submit" variant="secondary" size="sm" loading={isRestoring}>
              Restore skill
            </Button>
          </form>
        )}
      </div>

      <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={titleId}>
        <h2 id={titleId} className={styles.panelHeading}>
          {`Retire ${skill.name}?`}
        </h2>
        <div className={styles.dialogBody}>
          <p className={styles.panelNote}>
            It stays visible and cannot be newly added to anybody&rsquo;s skills.
          </p>
          <p className={styles.panelNote}>
            People who already have it keep it, and it can be restored later.
          </p>
        </div>

        <form action={retireAction}>
          <input type="hidden" name="skillId" value={skill.skillId} />
          <div className={styles.dialogActions}>
            <Button variant="secondary" onClick={() => dialogRef.current?.close()}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" onClick={() => dialogRef.current?.close()}>
              Retire skill
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}

/**
 * Linking the caller's own department.
 *
 * There is no department picker, because the endpoint takes no department: the
 * backend resolves the caller's from the request. Somebody holding the role
 * without an appointment gets an explanation instead of a disabled button.
 *
 * When the appointment lookup itself failed we say so, rather than reusing that
 * explanation: telling somebody they were never appointed because a request
 * failed is a claim about the organization we have not established. Only this
 * relationship is withheld — the catalogue entry and the author's own controls
 * are unaffected by it.
 */
function DepartmentLinkControls({
  skill,
  capabilities,
}: {
  readonly skill: CatalogueSkill;
  readonly capabilities: SkillAdminCapabilities;
}) {
  const [linkState, linkAction, isLinking] = useActionState(
    linkSkillToCurrentDepartmentAction,
    EMPTY_SKILL_ADMIN_STATE,
  );
  const [unlinkState, unlinkAction, isUnlinking] = useActionState(
    unlinkSkillFromCurrentDepartmentAction,
    EMPTY_SKILL_ADMIN_STATE,
  );

  const state = capabilities.department;

  if (state.kind === "error") {
    return (
      <>
        <p className={styles.panelNote}>
          Could not load your department management context, so linking is unavailable. This
          does not mean you manage no department.
        </p>
        <Link href={`/skills/${skill.skillId}`}>Try again</Link>
      </>
    );
  }

  if (state.kind === "unassigned") {
    return (
      <p className={styles.panelNote}>
        You are not assigned to manage a department, so you cannot link this skill to one. You
        can still add skills and categories.
      </p>
    );
  }

  const department = state.department;
  const action = linkActionFor(skill, capabilities);
  // The confirmation that agrees with the link as it now stands.
  const confirmation = capabilities.linkedToManagedDepartment
    ? linkState.done
    : unlinkState.done;

  return (
    <>
      {linkState.error ? (
        <Alert tone="danger" title="Not changed">
          {linkState.error}
        </Alert>
      ) : null}
      {unlinkState.error ? (
        <Alert tone="danger" title="Not changed">
          {unlinkState.error}
        </Alert>
      ) : null}
      {confirmation ? <Alert tone="success">{confirmation}</Alert> : null}

      {action === "unlink" ? (
        <form action={unlinkAction}>
          <input type="hidden" name="skillId" value={skill.skillId} />
          {/*
            A department name is bounded at 160 characters — still wide enough to
            set the page width from inside a button, which cannot wrap. The name
            moves to the accessible name, which begins with the visible label so
            the two agree (WCAG 2.5.3).
          */}
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            loading={isUnlinking}
            aria-label={`Unlink department: ${department.name}`}
          >
            Unlink department
          </Button>
        </form>
      ) : action === "link" ? (
        <form action={linkAction}>
          <input type="hidden" name="skillId" value={skill.skillId} />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            loading={isLinking}
            aria-label={`Link department: ${department.name}`}
          >
            Link department
          </Button>
        </form>
      ) : (
        // Retired and unlinked: the backend refuses new links, so there is no
        // control to offer rather than one that would always fail.
        <p className={styles.panelNote}>
          {`A retired skill cannot be linked to ${department.name}.`}
        </p>
      )}
    </>
  );
}
