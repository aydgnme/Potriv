"use client";

import { useState } from "react";

import { Button } from "@/shared/ui/Button";

import type { TeamRoleCatalogueEntry } from "../model/projectDetail";
import type { ProjectFormErrors } from "../model/projectForm";

import styles from "./Projects.module.css";

export type RequirementRow = {
  readonly teamRoleId: string;
  readonly requiredMembers: number;
};

export type TeamRoleRequirementsEditorProps = {
  readonly catalogue: readonly TeamRoleCatalogueEntry[];
  readonly initial: readonly RequirementRow[];
  /**
   * Roles this project already requires. An inactive role among them may stay;
   * an inactive role from anywhere else cannot be newly chosen.
   */
  readonly preservableRoleIds: readonly string[];
  readonly errors: ProjectFormErrors;
  readonly disabled: boolean;
};

type Row = { readonly key: number; teamRoleId: string; requiredMembers: string };

/**
 * How many people each team role needs.
 *
 * Roles come from the organization's catalogue — `teamRoleId`, never a name typed
 * by hand — because the backend resolves requirements against that catalogue and
 * a free-text role would simply be rejected.
 *
 * A role that was deactivated after this project attached it stays selectable
 * *for this project* and is marked Inactive. Dropping it silently would rewrite
 * the project's requirements as a side effect of editing something unrelated,
 * and the backend explicitly allows preserving it.
 */
export function TeamRoleRequirementsEditor({
  catalogue,
  initial,
  preservableRoleIds,
  errors,
  disabled,
}: TeamRoleRequirementsEditorProps) {
  const [rows, setRows] = useState<Row[]>(() =>
    initial.map((requirement, index) => ({
      key: index,
      teamRoleId: requirement.teamRoleId,
      requiredMembers: String(requirement.requiredMembers),
    })),
  );
  const [nextKey, setNextKey] = useState(initial.length);

  const preservable = new Set(preservableRoleIds);

  function update(key: number, patch: Partial<Omit<Row, "key">>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function add() {
    setRows((current) => [...current, { key: nextKey, teamRoleId: "", requiredMembers: "1" }]);
    setNextKey((key) => key + 1);
  }

  function remove(key: number) {
    setRows((current) => current.filter((row) => row.key !== key));
  }

  if (catalogue.length === 0) {
    return (
      <fieldset className={styles.fieldset} disabled={disabled}>
        <legend className={styles.legend}>Team-role requirements</legend>
        <p className={styles.panelNote}>
          No team roles are available. An Organization Admin must create team roles before
          they can be used as project requirements.
        </p>
      </fieldset>
    );
  }

  return (
    <fieldset className={styles.fieldset} disabled={disabled}>
      <legend className={styles.legend}>Team-role requirements</legend>
      <p className={styles.panelNote}>
        Leave it empty if the project does not need a defined team yet.
      </p>

      {rows.length === 0 ? (
        <p className={styles.panelNote}>No roles required.</p>
      ) : (
        <ul className={styles.editorRows}>
          {rows.map((row, index) => {
            const error = errors[`requirement.${index}`];
            const errorId = `requirement-error-${row.key}`;
            const selectedRole = catalogue.find((role) => role.teamRoleId === row.teamRoleId);

            return (
              <li key={row.key} className={styles.editorRow}>
                <div className={styles.editorField}>
                  <label className={styles.visuallyHidden} htmlFor={`team-role-${row.key}`}>
                    {`Team role ${index + 1}`}
                  </label>
                  <select
                    id={`team-role-${row.key}`}
                    name="teamRoleId"
                    className={[styles.control, error ? styles.controlInvalid : null]
                      .filter(Boolean)
                      .join(" ")}
                    value={row.teamRoleId}
                    onChange={(event) => update(row.key, { teamRoleId: event.target.value })}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                  >
                    <option value="">Choose a team role</option>
                    {catalogue
                      // An inactive role appears only where it is already used.
                      .filter((role) => role.active || preservable.has(role.teamRoleId))
                      .map((role) => (
                        <option key={role.teamRoleId} value={role.teamRoleId}>
                          {role.active ? role.name : `${role.name} (inactive)`}
                        </option>
                      ))}
                  </select>
                </div>

                <div className={styles.editorCount}>
                  <label className={styles.visuallyHidden} htmlFor={`required-members-${row.key}`}>
                    {`People needed for role ${index + 1}`}
                  </label>
                  <input
                    id={`required-members-${row.key}`}
                    name="requiredMembers"
                    className={styles.control}
                    type="number"
                    min={1}
                    step={1}
                    value={row.requiredMembers}
                    onChange={(event) =>
                      update(row.key, { requiredMembers: event.target.value })
                    }
                  />
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(row.key)}
                  aria-label={`Remove requirement ${index + 1}${
                    selectedRole ? `, ${selectedRole.name}` : ""
                  }`}
                >
                  Remove
                </Button>

                {error ? (
                  <span id={errorId} className={styles.rowError}>
                    {error}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div>
        <Button variant="secondary" size="sm" onClick={add}>
          Add requirement
        </Button>
      </div>
    </fieldset>
  );
}
