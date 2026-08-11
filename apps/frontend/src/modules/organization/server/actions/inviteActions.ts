"use server";

import { revalidatePath } from "next/cache";

import { resolveProductSession } from "@/modules/auth/server/productSession";

import type { InviteActionState } from "../../model/organizationActionState";
import { rotateOrganizationInvite } from "../organizationDataSources";

/**
 * Rotating the organization's employee invite link.
 *
 * This reads like a refresh and behaves like a revocation: the backend
 * deactivates every active invite before creating the new one, so anybody
 * holding the old link loses it the moment this succeeds. That is why the screen
 * confirms first and why the wording says so plainly.
 *
 * The new URL comes back from the backend and is used exactly as given. Building
 * one in the browser — or keeping the old one and swapping a token into it —
 * would be inventing an onboarding credential.
 */

const FALLBACK = {
  FORBIDDEN: "You do not have permission to manage the organization invite.",
  UNAUTHENTICATED: "Your session has expired. Sign in again to continue.",
  SERVER: "Something went wrong. Try again.",
} as const;

function messageFor(status: number, detail: string | null): string {
  if (detail !== null) return detail;
  if (status === 401) return FALLBACK.UNAUTHENTICATED;
  if (status === 403) return FALLBACK.FORBIDDEN;
  return FALLBACK.SERVER;
}

export async function rotateOrganizationInviteAction(
  _previous: InviteActionState,
): Promise<InviteActionState> {
  const session = await resolveProductSession();
  if (!session.authenticated || !session.user.roles.includes("ORGANIZATION_ADMIN")) {
    return { error: FALLBACK.FORBIDDEN };
  }

  const rotated = await rotateOrganizationInvite();
  if (!rotated.ok) {
    return { error: messageFor(rotated.status, rotated.detail) };
  }

  revalidatePath("/organization/invite");
  revalidatePath("/organization");
  revalidatePath("/home");

  // The link itself is rendered from the revalidated read, not carried in this
  // message — an action state is the wrong place for a credential.
  return { done: "A new invite link is ready. The previous link no longer works." };
}
