"use server";

import { revalidatePath } from "next/cache";

import { backendDelete, BackendRequestError } from "@/modules/auth/server-public";
import { resolveProductSession } from "@/modules/auth/server/productSession";

import { EMPTY_SESSION_STATE, type SessionActionState } from "../../model/accountActionState";

/**
 * Ending one of your own sessions.
 *
 * Three things are deliberately **not** done here.
 *
 * The session is not removed from the screen optimistically: the row disappears
 * because a fresh read no longer returns it, not because the browser assumed the
 * call worked. On a security screen, a row that vanishes without the server
 * agreeing is a lie about revoked access.
 *
 * Ownership is not checked here either. `revokeOwnedSession` looks the session up
 * by id **and** user, so a session belonging to somebody else is simply not
 * found. Re-implementing that check in the frontend would add a second opinion
 * that could disagree with the one that decides.
 *
 * And nothing is retried. This is an unsafe mutation; replaying it after an
 * ambiguous failure could revoke a session somebody has since signed back into.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function revokeSessionAction(
  _state: SessionActionState,
  formData: FormData,
): Promise<SessionActionState> {
  const session = await resolveProductSession();
  if (!session.authenticated) {
    return { error: "Your session has expired. Sign in again to continue." };
  }

  const sessionId = String(formData.get("sessionId") ?? "");
  // Validated before it can reach a path. The endpoint is fixed; only this
  // segment varies, and it may only ever be a UUID.
  if (!UUID.test(sessionId)) {
    return { error: "That session is no longer available." };
  }

  try {
    await backendDelete(`/auth/sessions/${sessionId}`);
  } catch (error) {
    if (error instanceof BackendRequestError) {
      // Already gone — revoked from another tab, or expired meanwhile. The list
      // is re-read so the screen catches up, and this is not reported as a
      // failure, because the session genuinely is not active any more.
      if (error.status === 404) {
        revalidatePath("/account");
        return { done: "That session had already ended." };
      }
      if (error.status === 401) {
        return { error: "Your session has expired. Sign in again to continue." };
      }
      return { error: "That session could not be ended. Try again." };
    }
    return { error: "That session could not be ended. Try again." };
  }

  // Authoritative refresh: the next render asks the backend what is left.
  revalidatePath("/account");
  return { done: "That session has been signed out." };
}

export { EMPTY_SESSION_STATE };
