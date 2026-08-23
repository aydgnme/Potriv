package me.aydgn.potriv.common.exception;

/**
 * Stable, machine-readable identifiers for the failures a client has to branch
 * on.
 *
 * These exist because a caller was branching on English prose. The BFF matched
 * the backend's message against {@code /invite/i} to decide whether a
 * registration had failed because the invitation was dead — so rewording a
 * sentence, or translating one, silently turned "this invite is no longer
 * valid" into "something went wrong". A message is for a person; a code is for
 * a program, and only one of them is safe to change.
 */
public final class ErrorCodes {

    /**
     * Every way an invitation can fail to redeem: unknown, expired, consumed,
     * withdrawn, addressed to somebody else, or already an account.
     *
     * Deliberately one code for all of them. Distinguishing them here would
     * hand back exactly the oracle the single generic message exists to close.
     */
    public static final String INVITE_INVALID = "INVITE_INVALID";

    private ErrorCodes() {
    }
}
