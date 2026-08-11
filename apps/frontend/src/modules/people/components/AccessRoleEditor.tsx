"use client";

import { useActionState } from "react";

import { roleLabel } from "@/shared/types/accessRole";
import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";

import { EMPTY_ROLE_STATE } from "../model/peopleActionState";
import { ROLE_DESCRIPTIONS, type RoleEditorState } from "../model/roleEditor";
import { updateUserRolesAction } from "../server/actions/roleActions";

import styles from "./People.module.css";

export type AccessRoleEditorProps = {
  readonly userId: string;
  readonly state: RoleEditorState;
};

/**
 * What this person can do in the product.
 *
 * A locked role says why it is locked rather than merely appearing dim — "you
 * cannot edit your own roles" and "the last admin must stay an admin" are
 * different facts, and a disabled checkbox alone communicates neither.
 *
 * Employee is always on and never removable, because the backend adds it to
 * every update: allowing it to be unticked and then silently reappearing would
 * misreport what was saved.
 *
 * Only the four ordinary product roles exist here. `SYSTEM_ADMIN` is not part of
 * the vocabulary this editor is built from.
 */
export function AccessRoleEditor({ userId, state }: AccessRoleEditorProps) {
  const [result, formAction, isPending] = useActionState(updateUserRolesAction, EMPTY_ROLE_STATE);

  /**
   * The boxes are uncontrolled, and re-seeded whenever the server's answer changes.
   *
   * React resets the form once a Server Action settles. With controlled boxes that
   * reset clears them in the DOM while React still believes they are ticked, so the
   * identical next render writes nothing back and a role that saved correctly shows
   * as unticked — the screen denying a capability the person now has.
   *
   * Elsewhere in the product the answer to that reset was to control every field,
   * because losing half-typed text is unacceptable. Here the opposite is right: the
   * only correct value is the one the backend just confirmed, so the reset restores
   * the truth, and a changed answer remounts the fieldset to take the new one.
   */
  const snapshot = state.options
    .map((option) => `${option.role}:${option.selected ? 1 : 0}:${option.locked ? 1 : 0}`)
    .join("|");

  return (
    <section className={styles.panel} aria-labelledby="access-roles">
      <h2 className={styles.panelHeading} id="access-roles">
        Access roles
      </h2>

      {state.readOnlyReason ? <Alert tone="info">{state.readOnlyReason}</Alert> : null}
      {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
      {result.error ? (
        <Alert tone="danger" title="Not saved">
          {result.error}
        </Alert>
      ) : null}
      {result.done ? <Alert tone="success">{result.done}</Alert> : null}

      <form action={formAction} className={styles.roleForm}>
        <input type="hidden" name="userId" value={userId} />

        <fieldset
          key={snapshot}
          className={styles.fieldset}
          disabled={isPending || !state.editable}
        >
          <legend className={styles.visuallyHidden}>Access roles</legend>

          {state.options.map((option) => {
            const helpId = `role-help-${option.role}`;

            return (
              <div key={option.role} className={styles.roleOption}>
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    name="role"
                    value={option.role}
                    defaultChecked={option.selected}
                    disabled={option.locked}
                    aria-describedby={helpId}
                  />
                  {roleLabel(option.role)}
                </label>
                <p id={helpId} className={styles.panelNote}>
                  {ROLE_DESCRIPTIONS[option.role]}
                  {option.lockReason ? ` ${option.lockReason}` : ""}
                </p>
                {/* A disabled checkbox submits nothing, so a locked-on role is
                    carried explicitly — the payload is the complete desired set. */}
                {option.locked && option.selected ? (
                  <input type="hidden" name="role" value={option.role} />
                ) : null}
              </div>
            );
          })}
        </fieldset>

        {state.editable ? (
          <div>
            <Button type="submit" variant="primary" loading={isPending}>
              Save access roles
            </Button>
          </div>
        ) : null}
      </form>
    </section>
  );
}
