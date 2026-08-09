"use server";

import { revalidatePath } from "next/cache";

import { resolveProductSession } from "@/modules/auth/server/productSession";

import type { RemovalActionState } from "../../model/reviewActionState";
import { ownsProject } from "../loadTeamFinder";
import {
  getProjectContext,
  getProjectTeamMembers,
  proposeDeallocation,
} from "../staffingDataSources";

/**
 * A project manager asking for someone to come off a project.
 *
 * This does not remove anyone. It creates a request their department manager
 * reviews, and the person stays on the project — active, allocated, counted —
 * until that decision is made. Every sentence here is written to keep that true.
 *
 * Nothing the form sends is authority. Ownership is re-read from the project, and
 * the allocation is re-read from the current team: an id that is not on the
 * active list right now — because it never was, or because it has already ended —
 * is refused before the backend is asked.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REASON_MAX = 5000;

const FALLBACK = {
  // The same sentence a missing project gets: two would let a caller learn which.
  NOT_FOUND: "This project does not exist or is not visible to you.",
  FORBIDDEN: "Only this project's manager can propose a removal.",
  CONFLICT: "This removal could not be requested as things stand.",
  VALIDATION: "That could not be accepted. Check the details and try again.",
  UNAUTHENTICATED: "Your session has expired. Sign in again to continue.",
  SERVER: "Something went wrong. Try again.",
} as const;

function messageFor(status: number, detail: string | null): string {
  if (detail !== null) return detail;
  if (status === 400 || status === 422) return FALLBACK.VALIDATION;
  if (status === 401) return FALLBACK.UNAUTHENTICATED;
  if (status === 403) return FALLBACK.FORBIDDEN;
  if (status === 404) return FALLBACK.NOT_FOUND;
  if (status === 409) return FALLBACK.CONFLICT;
  return FALLBACK.SERVER;
}

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function proposeDeallocationAction(
  _previous: RemovalActionState,
  formData: FormData,
): Promise<RemovalActionState> {
  const session = await resolveProductSession();
  if (!session.authenticated || !session.user.roles.includes("PROJECT_MANAGER")) {
    return { fieldErrors: {}, formError: FALLBACK.FORBIDDEN };
  }

  const projectId = readString(formData, "projectId");
  const allocationId = readString(formData, "allocationId");
  if (!UUID.test(projectId)) return { fieldErrors: {}, formError: FALLBACK.NOT_FOUND };
  if (!UUID.test(allocationId)) return { fieldErrors: {}, formError: FALLBACK.VALIDATION };

  const reason = readString(formData, "reason").trim();
  if (reason.length === 0) {
    // Required, because it is stored permanently with the past allocation and is
    // the only record of why somebody left.
    return { fieldErrors: { reason: "Say why this person should come off the project." } };
  }
  if (reason.length > REASON_MAX) {
    return { fieldErrors: { reason: `Use at most ${REASON_MAX} characters.` } };
  }

  const [project, team] = await Promise.all([
    getProjectContext(projectId),
    getProjectTeamMembers(projectId),
  ]);

  if (!project.ok) {
    return {
      fieldErrors: {},
      formError: project.reason === "ERROR" ? FALLBACK.SERVER : FALLBACK.NOT_FOUND,
    };
  }
  if (!ownsProject(session.user.roles, session.user.userId, project.value.projectManager?.userId)) {
    return { fieldErrors: {}, formError: FALLBACK.NOT_FOUND };
  }
  if (!team.ok) {
    return { fieldErrors: {}, formError: FALLBACK.SERVER };
  }

  // Active right now — not proposed, not already ended.
  const isActive = team.value.activeMembers.some(
    (member) => member.allocationId === allocationId,
  );
  if (!isActive) {
    return {
      fieldErrors: {},
      formError: "That allocation is no longer active on this project.",
    };
  }

  const outcome = await proposeDeallocation(projectId, allocationId, reason);
  if (!outcome.ok) {
    return { fieldErrors: {}, formError: messageFor(outcome.status, outcome.detail) };
  }

  // The team page gained a pending request, and the reviewing department's queue
  // has something new waiting.
  revalidatePath(`/projects/${projectId}/team`);
  revalidatePath("/staffing");

  return {
    fieldErrors: {},
    sentTo: outcome.value.reviewDepartment?.name ?? "the reviewing department",
  };
}
