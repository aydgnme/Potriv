/**
 * Validation for joining a workspace by invitation.
 *
 * Bounds copied from the backend's `RegisterEmployeeRequest` (name ≤120, a
 * valid email ≤180, password 8–72). A courtesy check so the form can answer
 * obvious mistakes without a round trip; the backend re-validates and stays the
 * authority.
 *
 * The invite token is deliberately **not** part of this shape. It travels in the
 * URL path to the backend and is never a form field, so it cannot be typed,
 * edited, echoed back, or accidentally validated as user input.
 */

export type InviteRegistrationInput = {
  readonly name: string;
  readonly email: string;
  readonly password: string;
};

export type InviteFieldErrors = Partial<Record<keyof InviteRegistrationInput, string>>;

export type InviteValidation =
  | { readonly ok: true; readonly value: InviteRegistrationInput }
  | { readonly ok: false; readonly errors: InviteFieldErrors };

export const INVITE_PASSWORD_MIN = 8;
export const INVITE_PASSWORD_MAX = 72;

/** Permissive by design — the mail server is the real authority on an address. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function validateInviteRegistration(
  raw: Partial<Record<keyof InviteRegistrationInput, unknown>>,
): InviteValidation {
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const email = typeof raw.email === "string" ? raw.email.trim() : "";
  const password = typeof raw.password === "string" ? raw.password : "";

  const errors: InviteFieldErrors = {};

  if (!name) errors.name = "Enter your name.";
  else if (name.length > 120) errors.name = "Use 120 characters or fewer.";

  if (!email) errors.email = "Enter your work email.";
  else if (email.length > 180) errors.email = "Use 180 characters or fewer.";
  else if (!looksLikeEmail(email)) errors.email = "Enter a valid email address.";

  if (!password) errors.password = "Choose a password.";
  else if (password.length < INVITE_PASSWORD_MIN) {
    errors.password = `Use at least ${INVITE_PASSWORD_MIN} characters.`;
  } else if (password.length > INVITE_PASSWORD_MAX) {
    errors.password = `Use ${INVITE_PASSWORD_MAX} characters or fewer.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return { ok: true, value: { name, email, password } };
}
