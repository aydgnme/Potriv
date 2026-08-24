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

    /**
     * Every way a password reset token can fail to redeem: unknown, expired,
     * or already used.
     *
     * The same reasoning as {@link #INVITE_INVALID}, and the same one code for
     * all of them: distinguishing "never existed" from "expired" from "already
     * used" would let a caller probe which one applies, which is the oracle a
     * single generic message exists to close in the first place.
     */
    public static final String RESET_TOKEN_INVALID = "RESET_TOKEN_INVALID";

    /**
     * Every way a workspace-registration verification token can fail to
     * redeem: unknown, expired, already used, or the address it was issued
     * to is now registered by some other means.
     *
     * Same reasoning as {@link #RESET_TOKEN_INVALID}: one code for all of
     * them, because distinguishing "never existed" from "somebody else beat
     * you to it" would hand back an oracle for exactly the enumeration this
     * flow exists to close.
     */
    public static final String REGISTER_TOKEN_INVALID = "REGISTER_TOKEN_INVALID";

    /** A rate limit was exceeded. The response's {@code Retry-After} header says how long to wait. */
    public static final String RATE_LIMITED = "RATE_LIMITED";

    private ErrorCodes() {
    }
}
