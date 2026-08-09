import { type ProjectStatus, isProjectStatus } from "@/shared/types/projectStatus";

import type { ProjectPeriod } from "./projectsData";
import type { TeamRoleCatalogueEntry } from "./projectDetail";

/**
 * The project definition as a form holds it, and the rules that turn it into a
 * request the backend will accept.
 *
 * Everything here is pure. The same function runs in the browser for immediate
 * feedback and again inside the Server Action, because client validation is a
 * courtesy and the second run is the one that matters.
 */

export type ProjectFormMode = "create" | "edit";

/** Raw strings, exactly as a form submits them. Nothing is trusted yet. */
export type ProjectFormInput = {
  readonly name: string;
  readonly period: string;
  readonly startDate: string;
  readonly deadlineDate: string;
  readonly status: string;
  readonly generalDescription: string;
  readonly technologies: readonly string[];
  readonly requirements: readonly RequirementInput[];
};

export type RequirementInput = {
  readonly teamRoleId: string;
  readonly requiredMembers: string;
};

/** The payload shape both `POST /projects` and `PATCH /projects/{id}` accept. */
export type ProjectWritePayload = {
  readonly name: string;
  readonly period: ProjectPeriod;
  readonly startDate: string;
  readonly deadlineDate: string | null;
  readonly status: ProjectStatus;
  /**
   * Always present, never null. A null would mean "leave unchanged" to the
   * backend, so clearing the description has to be an empty string that arrives.
   */
  readonly generalDescription: string;
  /** Present even when empty: `[]` clears the collection, absent would not. */
  readonly technologyStack: readonly string[];
  readonly teamRoles: readonly {
    readonly teamRoleId: string;
    readonly requiredMembers: number;
  }[];
};

/**
 * Keys are field names, or `technology.{index}` / `requirement.{index}` for a
 * repeated row, so an error can point at the row that caused it.
 */
export type ProjectFormErrors = Readonly<Record<string, string>>;

export type ProjectFormResult =
  | { readonly ok: true; readonly payload: ProjectWritePayload }
  | { readonly ok: false; readonly fieldErrors: ProjectFormErrors; readonly formError?: string };

export type ValidationContext = {
  readonly mode: ProjectFormMode;
  readonly catalogue: readonly TeamRoleCatalogueEntry[];
  /**
   * Roles the project already has. An inactive role among them may stay — the
   * backend allows preserving it — while an inactive role from anywhere else
   * cannot be newly chosen.
   */
  readonly preservableRoleIds?: readonly string[];
};

const NAME_MAX = 200;
const DESCRIPTION_MAX = 10_000;
const TECHNOLOGY_MAX = 160;

/** Statuses a project may be created with. The rest are reached by updating. */
export const CREATE_STATUSES: readonly ProjectStatus[] = ["NOT_STARTED", "STARTING"];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isProjectPeriod(value: string): value is ProjectPeriod {
  return value === "FIXED" || value === "ONGOING";
}

/**
 * Trims, collapses runs of whitespace and lowercases — the comparison key for
 * duplicate detection, mirroring what the backend does before storing.
 *
 * Only the comparison uses this. What the user typed keeps its own spacing until
 * submission, because rewriting an input while someone is still in it is its own
 * kind of bug.
 */
export function normalizeTechnology(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function technologyKey(value: string): string {
  return normalizeTechnology(value).toLowerCase();
}

export function validateProjectForm(
  input: ProjectFormInput,
  context: ValidationContext,
): ProjectFormResult {
  const fieldErrors: Record<string, string> = {};

  // ---- name ----
  const name = input.name.trim();
  if (name.length === 0) {
    fieldErrors.name = "Enter a project name.";
  } else if (name.length > NAME_MAX) {
    // Said, not silently cut: a truncated name is a different project.
    fieldErrors.name = `Use at most ${NAME_MAX} characters.`;
  }

  // ---- schedule ----
  const period = isProjectPeriod(input.period) ? input.period : null;
  if (period === null) fieldErrors.period = "Choose whether the project has a deadline.";

  const startDate = input.startDate.trim();
  if (startDate.length === 0) {
    fieldErrors.startDate = "Enter a start date.";
  } else if (!ISO_DATE.test(startDate)) {
    fieldErrors.startDate = "Enter a valid date.";
  }

  const deadlineDate = input.deadlineDate.trim();
  if (period === "FIXED") {
    if (deadlineDate.length === 0) {
      fieldErrors.deadlineDate = "A project with a fixed period needs a deadline.";
    } else if (!ISO_DATE.test(deadlineDate)) {
      fieldErrors.deadlineDate = "Enter a valid date.";
    } else if (ISO_DATE.test(startDate) && deadlineDate < startDate) {
      // Plain `LocalDate` strings compare correctly as text, and no timezone is
      // introduced by comparing them — these dates have none of their own.
      fieldErrors.deadlineDate = "The deadline cannot be before the start date.";
    }
  } else if (period === "ONGOING" && deadlineDate.length > 0) {
    fieldErrors.deadlineDate = "An ongoing project has no deadline.";
  }

  // ---- status ----
  const status = isProjectStatus(input.status) ? input.status : null;
  if (status === null) {
    fieldErrors.status = "Choose a status.";
  } else if (context.mode === "create" && !CREATE_STATUSES.includes(status)) {
    fieldErrors.status = "A new project can only start as Not started or Starting.";
  }

  // ---- description ----
  const generalDescription = input.generalDescription.trim();
  if (generalDescription.length > DESCRIPTION_MAX) {
    fieldErrors.generalDescription = `Use at most ${DESCRIPTION_MAX} characters.`;
  }

  // ---- technology stack ----
  const technologyStack: string[] = [];
  const seenTechnology = new Map<string, number>();
  input.technologies.forEach((raw, index) => {
    const display = normalizeTechnology(raw);
    // An empty row is someone who added a row and changed their mind, not an
    // error — it is simply not sent.
    if (display.length === 0) return;

    if (display.length > TECHNOLOGY_MAX) {
      fieldErrors[`technology.${index}`] = `Use at most ${TECHNOLOGY_MAX} characters.`;
      return;
    }

    const key = technologyKey(display);
    const firstAt = seenTechnology.get(key);
    if (firstAt !== undefined) {
      // "React" and " react " are the same technology to the backend, so they
      // are the same here too.
      fieldErrors[`technology.${index}`] = "This technology is already listed.";
      return;
    }

    seenTechnology.set(key, index);
    technologyStack.push(display);
  });

  // ---- team-role requirements ----
  const byId = new Map(context.catalogue.map((role) => [role.teamRoleId, role]));
  const preservable = new Set(context.preservableRoleIds ?? []);
  const teamRoles: { teamRoleId: string; requiredMembers: number }[] = [];
  const seenRole = new Set<string>();

  input.requirements.forEach((requirement, index) => {
    const teamRoleId = requirement.teamRoleId.trim();
    if (teamRoleId.length === 0) {
      fieldErrors[`requirement.${index}`] = "Choose a team role.";
      return;
    }

    const role = byId.get(teamRoleId);
    if (role === undefined) {
      fieldErrors[`requirement.${index}`] = "That team role is not available.";
      return;
    }

    if (!role.active && !preservable.has(teamRoleId)) {
      // Already attached inactive roles survive; unrelated ones cannot be added.
      fieldErrors[`requirement.${index}`] = `${role.name} is inactive and cannot be added.`;
      return;
    }

    if (seenRole.has(teamRoleId)) {
      fieldErrors[`requirement.${index}`] = "This team role is already required once.";
      return;
    }

    const requiredMembers = Number(requirement.requiredMembers.trim());
    if (!Number.isInteger(requiredMembers) || requiredMembers < 1) {
      fieldErrors[`requirement.${index}`] = "Enter how many people are needed — at least 1.";
      return;
    }

    seenRole.add(teamRoleId);
    teamRoles.push({ teamRoleId, requiredMembers });
  });

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, formError: "Check the highlighted fields." };
  }

  return {
    ok: true,
    payload: {
      name,
      period: period as ProjectPeriod,
      startDate,
      // Never carried over: an ongoing project's old deadline must not survive
      // the switch, and the backend clears the stored value when it is absent.
      deadlineDate: period === "FIXED" ? deadlineDate : null,
      status: status as ProjectStatus,
      generalDescription,
      technologyStack,
      teamRoles,
    },
  };
}
