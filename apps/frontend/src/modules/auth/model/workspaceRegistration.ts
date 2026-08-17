/**
 * Validation for creating a workspace, mirroring the backend's own constraints.
 *
 * The bounds are copied from `RegisterAdminRequest` on the Spring side
 * (name ≤120, email ≤180, password 8–72, organizationName ≤160,
 * headquarterAddress ≤1000). This is a courtesy check that lets the form answer
 * without a round trip — the backend re-validates everything and remains the
 * authority. Where the two ever disagree, the backend wins and its refusal is
 * what the user sees.
 *
 * Pure: no fetch, no cookies, no framework. It is imported by both the route
 * handler and its tests.
 */

export type WorkspaceRegistrationInput = {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly organizationName: string;
  readonly headquarterAddress: string;
};

export type WorkspaceFieldErrors = Partial<
  Record<keyof WorkspaceRegistrationInput, string>
>;

export type WorkspaceValidation =
  | { readonly ok: true; readonly value: WorkspaceRegistrationInput }
  | { readonly ok: false; readonly errors: WorkspaceFieldErrors };

/** Matches the backend's `@Size(min = 8, max = 72)`. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

/**
 * Deliberately permissive. Address-level email validation belongs to the thing
 * that can actually deliver mail; a regex that rejects a valid address is worse
 * than one that accepts an undeliverable one.
 */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function validateWorkspaceRegistration(
  raw: Partial<Record<keyof WorkspaceRegistrationInput, unknown>>,
): WorkspaceValidation {
  const name = text(raw.name);
  const email = text(raw.email);
  const password = typeof raw.password === "string" ? raw.password : "";
  const organizationName = text(raw.organizationName);
  const headquarterAddress = text(raw.headquarterAddress);

  const errors: WorkspaceFieldErrors = {};

  if (!name) errors.name = "Enter your name.";
  else if (name.length > 120) errors.name = "Use 120 characters or fewer.";

  if (!email) errors.email = "Enter your work email.";
  else if (email.length > 180) errors.email = "Use 180 characters or fewer.";
  else if (!looksLikeEmail(email)) errors.email = "Enter a valid email address.";

  if (!password) errors.password = "Choose a password.";
  else if (password.length < PASSWORD_MIN) {
    errors.password = `Use at least ${PASSWORD_MIN} characters.`;
  } else if (password.length > PASSWORD_MAX) {
    // The backend's ceiling is 72 bytes because of bcrypt, and a silent
    // truncation would mean a password that cannot be typed back.
    errors.password = `Use ${PASSWORD_MAX} characters or fewer.`;
  }

  if (!organizationName) errors.organizationName = "Name your organization.";
  else if (organizationName.length > 160) {
    errors.organizationName = "Use 160 characters or fewer.";
  }

  if (!headquarterAddress) errors.headquarterAddress = "Enter a headquarters address.";
  else if (headquarterAddress.length > 1000) {
    errors.headquarterAddress = "Use 1000 characters or fewer.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: { name, email, password, organizationName, headquarterAddress },
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
