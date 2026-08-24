package me.aydgn.potriv.common.ratelimit;

import java.time.Duration;

/**
 * A quota was exceeded. Carries how long the caller should wait, so the HTTP
 * layer can answer with a {@code Retry-After} that means something rather
 * than a fixed guess.
 */
public class RateLimitExceededException extends RuntimeException {

    private final long retryAfterSeconds;

    public RateLimitExceededException(Duration retryAfter) {
        super("Rate limit exceeded.");
        // Rounded up: telling a caller to retry in 0 seconds when 400ms remain
        // just produces an immediate second rejection.
        this.retryAfterSeconds = Math.max(1, retryAfter.toSeconds() + (retryAfter.toNanosPart() > 0 ? 1 : 0));
    }

    public long retryAfterSeconds() {
        return retryAfterSeconds;
    }
}
