"use client";

import { useActionState, useRef, useState } from "react";

import { PROJECT_STATUSES, type ProjectStatus } from "@/shared/types/projectStatus";
import { Alert } from "@/shared/ui/Alert";
import { FormErrorSummary } from "@/shared/ui/FormErrorSummary";
import { Button } from "@/shared/ui/Button";
import { Input } from "@/shared/ui/Input";
import { Select } from "@/shared/ui/Select";
import { Textarea } from "@/shared/ui/Textarea";
import { projectStatusLabel } from "@/shared/utils/projectStatus";

import type { TeamRoleCatalogueEntry } from "../model/projectDetail";
import { CREATE_STATUSES, type ProjectFormMode } from "../model/projectForm";
import type { ProjectPeriod } from "../model/projectsData";
import { EMPTY_ACTION_STATE, type ProjectActionState } from "../model/projectActionState";

import { TeamRoleRequirementsEditor, type RequirementRow } from "./TeamRoleRequirementsEditor";
import { TechnologyStackEditor } from "./TechnologyStackEditor";
import styles from "./Projects.module.css";

export type ProjectFormDefaults = {
  readonly name: string;
  readonly period: ProjectPeriod;
  readonly startDate: string;
  readonly deadlineDate: string;
  readonly status: ProjectStatus;
  readonly generalDescription: string;
  readonly technologies: readonly string[];
  readonly requirements: readonly RequirementRow[];
};

export type ProjectFormProps = {
  readonly mode: ProjectFormMode;
  readonly action: (
    state: ProjectActionState,
    formData: FormData,
  ) => Promise<ProjectActionState>;
  readonly defaults: ProjectFormDefaults;
  readonly catalogue: readonly TeamRoleCatalogueEntry[];
  readonly preservableRoleIds: readonly string[];
  readonly projectId?: string;
  readonly submitLabel: string;
  /** Set when a dependency failed to load and saving would destroy data. */
  readonly blockedReason?: string;
};

/**
 * The whole project definition on one page.
 *
 * Not a wizard: every part of a project is decided together, and hiding half of
 * it behind a Next button would only make people click through screens they
 * cannot answer yet.
 *
 * The form always submits the complete editable state. `PATCH` treats an absent
 * field as "leave unchanged" and an absent list as "leave the collection alone",
 * so a form that omitted what the user cleared would quietly refuse to clear it.
 */
export function ProjectForm({
  mode,
  action,
  defaults,
  catalogue,
  preservableRoleIds,
  projectId,
  submitLabel,
  blockedReason,
}: ProjectFormProps) {
  const [state, formAction, isPending] = useActionState(action, EMPTY_ACTION_STATE);

  // Every field is controlled, deliberately. React resets uncontrolled inputs in
  // a form once its action completes, so a rejected submission would hand back
  // errors alongside an emptied form — the one moment someone least wants to
  // retype what they just wrote.
  const [name, setName] = useState(defaults.name);
  const [generalDescription, setGeneralDescription] = useState(defaults.generalDescription);
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [period, setPeriod] = useState<ProjectPeriod>(defaults.period);
  const [deadlineDate, setDeadlineDate] = useState(defaults.deadlineDate);
  const [status, setStatus] = useState<ProjectStatus>(defaults.status);

  const formRef = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmedRef = useRef(false);

  const statuses = mode === "create" ? CREATE_STATUSES : PROJECT_STATUSES;
  const statusChanged = status !== defaults.status;
  const blocked = blockedReason !== undefined;

  function changePeriod(next: ProjectPeriod) {
    setPeriod(next);
    // Cleared from state, not merely hidden: an ongoing project must never carry
    // the deadline it had when it was fixed.
    if (next === "ONGOING") setDeadlineDate("");
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    // A status change is the one edit that can affect other people's allocations,
    // so it is confirmed in words that name both ends of the change.
    if (mode === "edit" && statusChanged && !confirmedRef.current) {
      event.preventDefault();
      dialogRef.current?.showModal();
    }
  }

  function confirmStatusChange() {
    confirmedRef.current = true;
    dialogRef.current?.close();
    formRef.current?.requestSubmit();
  }

  const errors = state.fieldErrors;

  return (
    <form ref={formRef} action={formAction} onSubmit={handleSubmit} className={styles.form}>
      {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}

      {blockedReason ? <Alert tone="warning">{blockedReason}</Alert> : null}
      {/* One alert for the whole submission. A validation result here can carry
          a form-level message *and* field errors at once (projectActions.ts),
          so both go into the same region rather than one hiding the other. */}
      <FormErrorSummary
        formError={state.formError}
        title={state.formError ? "This was not saved" : undefined}
        fieldErrors={errors}
        labels={{
          name: "Project name",
          generalDescription: "Description",
          period: "Period",
          startDate: "Start date",
          deadlineDate: "Deadline",
          status: "Status",
          technologyStack: "Technology stack",
          teamRoles: "Team roles",
        }}
        order={[
          "name", "generalDescription", "period", "startDate", "deadlineDate",
          "status", "technologyStack", "teamRoles",
        ]}
      />

      <fieldset className={styles.fieldset} disabled={isPending || blocked}>
        <legend className={styles.legend}>Basics</legend>
        <div className={styles.formGrid}>
          <Input
            label="Project name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={200}
            requirement="Required"
            error={errors.name}
          />
        </div>
        <Textarea
          label="Description"
          name="generalDescription"
          value={generalDescription}
          onChange={(event) => setGeneralDescription(event.target.value)}
          maxLength={10000}
          rows={5}
          requirement="Optional"
          hint="Plain text. What the project is for, in a few sentences."
          error={errors.generalDescription}
        />
      </fieldset>

      <fieldset className={styles.fieldset} disabled={isPending || blocked}>
        <legend className={styles.legend}>Schedule and status</legend>
        <div className={styles.formGrid}>
          <Select
            label="Period"
            name="period"
            value={period}
            onChange={(event) => changePeriod(event.target.value as ProjectPeriod)}
            requirement="Required"
            error={errors.period}
            hint={
              period === "ONGOING"
                ? "An ongoing project has no deadline."
                : "A fixed project runs to a deadline."
            }
          >
            <option value="FIXED">Fixed</option>
            <option value="ONGOING">Ongoing</option>
          </Select>

          <Input
            label="Start date"
            name="startDate"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            requirement="Required"
            error={errors.startDate}
          />

          {/* Not rendered at all for an ongoing project, so there is no hidden
              field left to submit. */}
          {period === "FIXED" ? (
            <Input
              label="Deadline"
              name="deadlineDate"
              type="date"
              value={deadlineDate}
              onChange={(event) => setDeadlineDate(event.target.value)}
              requirement="Required"
              error={errors.deadlineDate}
            />
          ) : null}

          <Select
            label="Status"
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as ProjectStatus)}
            requirement="Required"
            error={errors.status}
            hint={
              mode === "create"
                ? "A new project starts in planning. Later stages are reached by updating it."
                : undefined
            }
          >
            {statuses.map((value) => (
              <option key={value} value={value}>
                {projectStatusLabel(value)}
              </option>
            ))}
          </Select>
        </div>
      </fieldset>

      <TechnologyStackEditor
        initial={defaults.technologies}
        errors={errors}
        disabled={isPending || blocked}
      />

      <TeamRoleRequirementsEditor
        catalogue={catalogue}
        initial={defaults.requirements}
        preservableRoleIds={preservableRoleIds}
        errors={errors}
        disabled={isPending || blocked}
      />

      <div className={styles.formActions}>
        <Button type="submit" variant="primary" loading={isPending} disabled={blocked}>
          {submitLabel}
        </Button>
      </div>

      {/* A real dialog: focus is trapped, Escape closes it, and the sentence
          names the status it is leaving as well as the one it is going to. */}
      <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="status-change-title">
        <h2 id="status-change-title" className={styles.panelHeading}>
          Change project status?
        </h2>
        <p>
          {`Change project status from ${projectStatusLabel(defaults.status)} to ${projectStatusLabel(status)}?`}
        </p>
        <div className={styles.formActions}>
          <Button variant="secondary" onClick={() => dialogRef.current?.close()}>
            Cancel
          </Button>
          <Button variant="primary" onClick={confirmStatusChange}>
            Change status
          </Button>
        </div>
      </dialog>
    </form>
  );
}
