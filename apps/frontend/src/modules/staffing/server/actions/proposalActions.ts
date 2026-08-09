"use server";

import { revalidatePath } from "next/cache";

import { resolveProductSession } from "@/modules/auth/server/productSession";

import type { ProposalState } from "../../model/proposalState";
import { proposableRequirements } from "../../utils/openRequirements";
import { getProjectContext, proposeAssignment } from "../staffingDataSources";
import { ownsProject } from "../loadTeamFinder";

/**
 * Proposing someone for a project.
 *
 * A proposal is a request, not an assignment — a department manager still
 * decides — so nothing here reports success in terms of the person joining.
 *
 * Every input is re-derived rather than trusted. The form knows which roles were
 * offered, but it is the browser that sends them back, so the project is read
 * again here and the allowed set recomputed from what it actually requires now.
 * A role that has since been filled, deactivated or never existed is refused
 * before the backend is asked.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COMMENTS_MAX = 5000;

const FALLBACK: Readonly<Record<string, string>> = {
  // The same sentence for missing and for not-visible: two would let a caller
  // learn which.
  NOT_FOUND: "This project does not exist or is not visible to you.",
  FORBIDDEN: "You do not have permission to staff this project.",
  CONFLICT: "This no longer fits the employee's current capacity.",
  VALIDATION: "Some of these details were not accepted. Check the form and try again.",
  UNAUTHENTICATED: "Your session has expired. Sign in again to continue.",
  SERVER: "Something went wrong. Try again.",
};

function messageFor(status: number, detail: string | null): string {
  if (detail !== null) return detail;
  if (status === 400 || status === 422) return FALLBACK.VALIDATION!;
  if (status === 401) return FALLBACK.UNAUTHENTICATED!;
  if (status === 403) return FALLBACK.FORBIDDEN!;
  if (status === 404) return FALLBACK.NOT_FOUND!;
  if (status === 409) return FALLBACK.CONFLICT!;
  return FALLBACK.SERVER!;
}

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function proposeAssignmentAction(
  _previous: ProposalState,
  formData: FormData,
): Promise<ProposalState> {
  const session = await resolveProductSession();
  if (!session.authenticated || !session.user.roles.includes("PROJECT_MANAGER")) {
    return { fieldErrors: {}, formError: FALLBACK.FORBIDDEN };
  }

  const projectId = readString(formData, "projectId");
  const employeeId = readString(formData, "employeeId");
  if (!UUID.test(projectId)) {
    return { fieldErrors: {}, formError: FALLBACK.NOT_FOUND };
  }
  if (!UUID.test(employeeId)) {
    return { fieldErrors: {}, formError: FALLBACK.VALIDATION };
  }

  // Re-read rather than trust: ownership and the current requirement list are
  // both facts about the project, not about the form.
  const project = await getProjectContext(projectId);
  if (!project.ok) {
    return {
      fieldErrors: {},
      formError:
        project.reason === "ERROR" ? FALLBACK.SERVER : FALLBACK.NOT_FOUND,
    };
  }
  if (!ownsProject(session.user.roles, session.user.userId, project.value.projectManager?.userId)) {
    return { fieldErrors: {}, formError: FALLBACK.NOT_FOUND };
  }

  const fieldErrors: Record<string, string> = {};

  const workHoursPerDay = Number(readString(formData, "workHoursPerDay").trim());
  if (!Number.isInteger(workHoursPerDay) || workHoursPerDay < 1) {
    fieldErrors.workHoursPerDay = "Enter whole hours per day — at least 1.";
  }

  const comments = readString(formData, "comments").trim();
  if (comments.length > COMMENTS_MAX) {
    fieldErrors.comments = `Use at most ${COMMENTS_MAX} characters.`;
  }

  // Active requirements that still want people, as the project stands right now.
  const allowed = new Set(
    proposableRequirements(project.value).map(
      (opening) => opening.requirement.teamRole.teamRoleId,
    ),
  );

  const submitted = formData
    .getAll("teamRoleId")
    .filter((value): value is string => typeof value === "string");

  const teamRoleIds: string[] = [];
  for (const teamRoleId of submitted) {
    if (teamRoleIds.includes(teamRoleId)) {
      fieldErrors.teamRoleIds = "Each role can only be proposed once.";
      continue;
    }
    if (!allowed.has(teamRoleId)) {
      // Filled since the page loaded, deactivated, or never offered at all.
      fieldErrors.teamRoleIds = "One of those roles is no longer open on this project.";
      continue;
    }
    teamRoleIds.push(teamRoleId);
  }

  if (teamRoleIds.length === 0 && fieldErrors.teamRoleIds === undefined) {
    fieldErrors.teamRoleIds = "Choose at least one role.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, formError: "Check the highlighted fields." };
  }

  const outcome = await proposeAssignment(projectId, {
    employeeId,
    workHoursPerDay,
    teamRoleIds,
    ...(comments.length > 0 ? { comments } : {}),
  });

  if (!outcome.ok) {
    // Capacity can change between the finder's snapshot and this moment, and the
    // backend is the authority on that. The form stays open with the reason.
    return { fieldErrors: {}, formError: messageFor(outcome.status, outcome.detail) };
  }

  // The team page gained a proposed member, and a fresh finder run should no
  // longer offer someone who now has a pending proposal on this project.
  revalidatePath(`/projects/${projectId}/team`);
  revalidatePath(`/projects/${projectId}/team-finder`);

  return {
    fieldErrors: {},
    sentTo: outcome.value.reviewDepartment?.name ?? "the reviewing department",
  };
}
