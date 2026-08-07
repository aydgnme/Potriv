import { randomBytes } from 'node:crypto';

/**
 * Credentials for one isolated run, generated fresh at process start.
 *
 * These were literals in source until a secret scanner flagged them — correctly.
 * "It is only a test password" is exactly the reasoning that normalises real
 * leaks, and a committed credential is a committed credential whatever it opens.
 *
 * Generating them is also simply better: two runs never share one, and nothing
 * a scanner can find in the repository will ever authenticate anywhere.
 *
 * Everything they protect lives for the length of a run: a `tmpfs` PostgreSQL, a
 * Mailpit container and a backend on a loopback port.
 */
function password(): string {
  // 8–72 characters is the backend's rule; ~28 comfortably clears it, and clears
  // the production guard's 12-character floor too.
  return `Qa1-${randomBytes(18).toString('base64url')}`;
}

/** Password for every generated organization actor. */
export const DEFAULT_PASSWORD = password();

/** Bootstrap credential for the isolated backend's SYSTEM_ADMIN. */
export const SYSTEM_ADMIN_PASSWORD = password();

/** Replacement password used by the password-reset flow. */
export const ROTATED_PASSWORD = password();

/** A second replacement, used to prove a reset token cannot be replayed. */
export const REPLAY_PASSWORD = password();

/** Credential for the throwaway PostgreSQL container. */
export const DATABASE_PASSWORD = randomBytes(24).toString('hex');
