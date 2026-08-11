"use server";

import { revalidatePath } from "next/cache";

import { resolveProductSession } from "@/modules/auth/server/productSession";

import type { RoleActionState } from "../../model/peopleActionState";
import { parseRolePayload, roleEditorState, validateRoleChange } from "../../model/roleEditor";
import { getOrganizationUser, getOrganizationUsers, updateUserRoles } from "../peopleDataSources";

/**
 * Changing somebody's access roles.
 *
 * Every fact the decision rests on is re-read here: who this person is now, who
 * else is in the organization, how many admins there are. The form knows all of
 * that too, but the form is the browser's — a page loaded an hour ago would
 * happily claim to be the only admin, or the only person.
 *
 * The submitted vocabulary is closed, and checked before anything is read. A role
 * this product does not offer fails the whole request rather than being dropped
 * from it: because the endpoint replaces the complete role set, a discarded value
 * would leave behind a different, perfectly valid mutation nobody asked for.
 *
 * `EMPLOYEE` is still forced back in, so the baseline does not depend on the
 * editor having rendered correctly.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FALLBACK = {
  FORBIDDEN: "You do not have permission to change access roles.",
  // The same sentence a missing person gets: two would let a caller learn which.
  NOT_FOUND: "This person does not exist or is not visible to you.",
  VALIDATION: "Those roles were not accepted. Check the selection and try again.",
  UNAUTHENTICATED: "Your session has expired. Sign in again to continue.",
  SERVER: "Something went wrong. Try again.",
} as const;

function messageFor(status: number, detail: string | null): string {
  if (detail !== null) return detail;
  if (status === 400 || status === 422) return FALLBACK.VALIDATION;
  if (status === 401) return FALLBACK.UNAUTHENTICATED;
  if (status === 403) return FALLBACK.FORBIDDEN;
  if (status === 404) return FALLBACK.NOT_FOUND;
  return FALLBACK.SERVER;
}

export async function updateUserRolesAction(
  _previous: RoleActionState,
  formData: FormData,
): Promise<RoleActionState> {
  const session = await resolveProductSession();
  if (!session.authenticated || !session.user.roles.includes("ORGANIZATION_ADMIN")) {
    return { error: FALLBACK.FORBIDDEN };
  }

  const userId = formData.get("userId");
  if (typeof userId !== "string" || !UUID.test(userId)) {
    return { error: FALLBACK.NOT_FOUND };
  }

  // A role outside the product vocabulary makes the whole submission invalid, and
  // proving that needs no reads at all — so nothing is fetched and, more to the
  // point, no other mutation can be derived from a malformed request.
  const parsed = parseRolePayload(
    formData.getAll("role").filter((value): value is string => typeof value === "string"),
  );
  if (!parsed.ok) {
    return { error: FALLBACK.VALIDATION };
  }
  const requested = parsed.roles;

  // Fresh authority: the organization as it is now, not as the page had it.
  const [organization, target] = await Promise.all([
    getOrganizationUsers(),
    getOrganizationUser(userId),
  ]);

  if (!organization.ok) {
    return { error: organization.reason === "ERROR" ? FALLBACK.SERVER : FALLBACK.FORBIDDEN };
  }
  if (!target.ok) {
    return { error: target.reason === "ERROR" ? FALLBACK.SERVER : FALLBACK.NOT_FOUND };
  }

  const state = roleEditorState({
    target: target.value,
    currentUserId: session.user.userId,
    organizationUsers: organization.value,
  });

  const allowed = validateRoleChange(state, requested);
  if (!allowed.ok) {
    return { error: allowed.reason };
  }

  const saved = await updateUserRoles(userId, requested);
  if (!saved.ok) {
    // The backend re-checks all of this transactionally and stays the authority
    // — a second admin may have appeared, or vanished, since the reads above.
    return { error: messageFor(saved.status, saved.detail) };
  }

  revalidatePath("/people");
  revalidatePath(`/people/${userId}`);
  // Roles compose Home and the navigation shell.
  revalidatePath("/home");
  if (userId === session.user.userId) {
    // Newly added capabilities change what this session can reach; the backend
    // rebuilds roles from the database on the next request, so nothing here
    // needs a sign-out and none is suggested.
    revalidatePath("/", "layout");
  }

  return { done: `Access roles updated for ${saved.value.name}.` };
}
