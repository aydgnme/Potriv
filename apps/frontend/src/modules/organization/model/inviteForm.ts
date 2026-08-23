/**
 * Validation for the address an administrator is inviting.
 *
 * Bounds copied from the backend's `InviteEmployeeRequest` (a valid email,
 * ≤320 characters — the RFC's maximum address length, which is also the
 * column's). A courtesy check so the form can answer an obvious typo without a
 * round trip; the backend re-validates and stays the authority.
 *
 * Deliberately permissive about shape: the mail server is the only real
 * authority on whether an address exists, and a stricter pattern here would
 * reject valid addresses while catching nothing an attacker cares about.
 */

export const INVITE_EMAIL_MAX = 320;

export type InviteEmailValidation =
  | { readonly ok: true; readonly email: string }
  | { readonly ok: false; readonly error: string };

export function validateInviteEmail(raw: unknown): InviteEmailValidation {
  const email = typeof raw === "string" ? raw.trim() : "";

  if (!email) return { ok: false, error: "Enter the person's work email." };
  if (email.length > INVITE_EMAIL_MAX) {
    return { ok: false, error: `Use ${INVITE_EMAIL_MAX} characters or fewer.` };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  return { ok: true, email };
}
