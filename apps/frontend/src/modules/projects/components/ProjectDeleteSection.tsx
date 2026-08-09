"use client";

import { useActionState, useRef } from "react";

import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";

import { EMPTY_ACTION_STATE } from "../model/projectActionState";
import { deleteProjectAction } from "../server/actions/projectActions";

import styles from "./Projects.module.css";

export type ProjectDeleteSectionProps = {
  readonly projectId: string;
  readonly projectName: string;
};

/**
 * Deleting the project, at the bottom of Settings where it belongs.
 *
 * **Deletability is never predicted here.** The backend refuses deletion once a
 * project has *ever* reached In progress, Closing or Closed — a rule about its
 * status history, not its status now. No endpoint exposes that history, so a
 * project sitting in Not started may still be undeletable, and a frontend that
 * offered or hid the button based on the current status would be confidently
 * wrong. The button is always offered, always confirmed, and the backend decides.
 *
 * A refusal keeps the person here with an explanation and the project intact.
 */
export function ProjectDeleteSection({ projectId, projectName }: ProjectDeleteSectionProps) {
  const [state, formAction, isPending] = useActionState(deleteProjectAction, EMPTY_ACTION_STATE);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <section className={styles.dangerPanel} aria-labelledby="delete-project">
      <h2 className={styles.panelHeading} id="delete-project">
        Delete project
      </h2>
      <p className={styles.panelNote}>
        A project can only be deleted while it is still in planning. Once it has started, it
        stays on the record.
      </p>

      {state.formError ? (
        <Alert tone="warning" title="This project was not deleted">
          {state.formError}
        </Alert>
      ) : null}

      <form ref={formRef} action={formAction}>
        <input type="hidden" name="projectId" value={projectId} />
        <Button
          variant="danger"
          onClick={() => dialogRef.current?.showModal()}
          loading={isPending}
        >
          Delete project
        </Button>

        <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="delete-confirm-title">
          <h2 id="delete-confirm-title" className={styles.panelHeading}>
            Delete this project?
          </h2>
          <p>{`${projectName} and its requirements will be removed. This cannot be undone.`}</p>
          <div className={styles.formActions}>
            <Button variant="secondary" onClick={() => dialogRef.current?.close()}>
              Keep project
            </Button>
            <Button
              type="submit"
              variant="danger"
              onClick={() => dialogRef.current?.close()}
            >
              Delete project
            </Button>
          </div>
        </dialog>
      </form>
    </section>
  );
}
