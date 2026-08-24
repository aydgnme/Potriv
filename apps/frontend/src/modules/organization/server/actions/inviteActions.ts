"use server";

import { revalidatePath } from "next/cache";

import { resolveProductSession } from "@/modules/auth/server/productSession";

import { validateInviteEmail } from "../../model/inviteForm";
import type { InviteActionState } from "../../model/organizationActionState";
import { createOrganizationInvite, revokeOrganizationInvite } from "../organizationDataSources";

/**
 * Inviting one person, and withdrawing an invitation.
 *
 * The invitation's credential never passes through here. The administrator
 * supplies an address; the backend generates a token, stores only its hash, and
 * mails the link to that address itself. Nothing in this file — no argument, no
 * return value, no revalidated read — can be used to join the organization.
 *
 * That is the whole reason the old "copy the link" flow is gone. A link an
 * administrator can see is a link an administrator can forward, paste into a
 * ticket, or leave in a screenshot, and one that anybody who obtained it could
 * redeem. This one only works from the invited person's mailbox.
 *
 * A rejected address is reported with the entered value so it can be corrected
 * rather than retyped. It is never echoed anywhere else.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FALLBACK = {
  FORBIDDEN: "You do not have permission to manage invitations.",
  // One sentence for both, so trying identifiers reveals nothing.
  NOT_FOUND: "This invitation does not exist or is not visible to you.",
  VALIDATION: "That address was not accepted.",
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

async function requireOrganizationAdmin(): Promise<boolean> {
  const session = await resolveProductSession();
  return session.authenticated && session.user.roles.includes("ORGANIZATION_ADMIN");
}

function refreshInvitations(): void {
  revalidatePath("/organization/invite");
  revalidatePath("/organization");
  revalidatePath("/home");
}

export async function inviteEmployeeAction(
  _previous: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  if (!(await requireOrganizationAdmin())) return { error: FALLBACK.FORBIDDEN };

  const raw = formData.get("email");
  const entered = typeof raw === "string" ? raw : "";

  const validated = validateInviteEmail(entered);
  if (!validated.ok) return { fieldError: validated.error, email: entered };

  const created = await createOrganizationInvite(validated.email);
  if (!created.ok) {
    return { error: messageFor(created.status, created.detail), email: entered };
  }

  refreshInvitations();

  /**
   * "Queued", not "sent", because that is what happened.
   *
   * The backend records the intention and answers 202; a worker mints the token
   * and mails it afterwards. Saying "sent" here would be the same lie the old
   * `catch (MailException)` told — and the delivery column on the list is where
   * the administrator finds out whether it actually went.
   *
   * The address named is the one the administrator just typed, which they
   * already know; nothing the backend returned is echoed, because the response
   * masks the address precisely so the full one is not re-circulated.
   */
  return {
    done: `An invitation to ${validated.email} is queued. The list below shows`
      + ` whether it has been delivered.`,
  };
}

export async function revokeInviteAction(
  _previous: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  if (!(await requireOrganizationAdmin())) return { error: FALLBACK.FORBIDDEN };

  const raw = formData.get("inviteId");
  const inviteId = typeof raw === "string" ? raw : "";
  // Narrowed before it can reach a path.
  if (!UUID.test(inviteId)) return { error: FALLBACK.NOT_FOUND };

  const revoked = await revokeOrganizationInvite(inviteId);
  if (!revoked.ok) {
    return { error: messageFor(revoked.status, revoked.detail) };
  }

  refreshInvitations();

  return { done: "The invitation was withdrawn. Its link no longer works." };
}
