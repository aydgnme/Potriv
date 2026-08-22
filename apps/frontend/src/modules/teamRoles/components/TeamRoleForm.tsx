"use client";

import { useActionState } from "react";

import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";
import { FormErrorSummary } from "@/shared/ui/FormErrorSummary";

import { EMPTY_TEAM_ROLE_STATE } from "../model/teamRoleActionState";
import type { TeamRole } from "../model/teamRoleData";
import { TEAM_ROLE_DESCRIPTION_MAX, TEAM_ROLE_NAME_MAX } from "../model/teamRoleForm";
import {
  createTeamRoleAction,
  updateTeamRoleAction,
} from "../server/actions/teamRoleActions";

import styles from "./TeamRoles.module.css";

export type TeamRoleFormProps = {
  /** Absent when creating. */
  readonly teamRole?: TeamRole;
};

/**
 * Creating or renaming a team role.
 *
 * One form for both, because the fields and the rules are the same — only the
 * action and whether an id rides along differ. Whether the name is free is never
 * predicted: only the organization's whole set could answer it, and a 409 comes
 * back into this form with the values intact.
 */
export function TeamRoleForm({ teamRole }: TeamRoleFormProps) {
  const [state, formAction, isPending] = useActionState(
    teamRole ? updateTeamRoleAction : createTeamRoleAction,
    EMPTY_TEAM_ROLE_STATE,
  );

  return (
    <form action={formAction} className={styles.form}>
      <FormErrorSummary
        submission={state}
        formError={state.error}
        title={state.error ? (teamRole ? "Not saved" : "Not created") : undefined}
        fieldErrors={state.fieldErrors}
        labels={{ name: "Name", description: "Description" }}
        order={["name", "description"]}
      />
      {state.done ? <Alert tone="success">{state.done}</Alert> : null}

      {teamRole ? (
        <input type="hidden" name="teamRoleId" value={teamRole.teamRoleId} />
      ) : null}

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="team-role-name">
          Name
        </label>
        <input
          id="team-role-name"
          name="name"
          className={styles.control}
          maxLength={TEAM_ROLE_NAME_MAX}
          defaultValue={state.name ?? teamRole?.name ?? ""}
          aria-describedby={state.fieldErrors?.name ? "team-role-name-error" : undefined}
          aria-invalid={state.fieldErrors?.name ? true : undefined}
        />
        {state.fieldErrors?.name ? (
          <p id="team-role-name-error" className={styles.fieldError}>
            {state.fieldErrors.name}
          </p>
        ) : null}
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="team-role-description">
          Description
        </label>
        <textarea
          id="team-role-description"
          name="description"
          className={`${styles.control} ${styles.textarea}`}
          maxLength={TEAM_ROLE_DESCRIPTION_MAX}
          defaultValue={state.description ?? teamRole?.description ?? ""}
          aria-describedby={
            state.fieldErrors?.description ? "team-role-description-error" : undefined
          }
          aria-invalid={state.fieldErrors?.description ? true : undefined}
        />
        {state.fieldErrors?.description ? (
          <p id="team-role-description-error" className={styles.fieldError}>
            {state.fieldErrors.description}
          </p>
        ) : null}
      </div>

      <div>
        <Button type="submit" variant="primary" loading={isPending}>
          {teamRole ? "Save team role" : "Create team role"}
        </Button>
      </div>
    </form>
  );
}
