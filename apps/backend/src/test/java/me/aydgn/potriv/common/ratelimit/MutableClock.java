package me.aydgn.potriv.common.ratelimit;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;

/**
 * A {@link Clock} a test can set, for exactly one reason: pinning
 * {@link RateLimitService}'s fixed-window arithmetic to a known instant so a
 * burst of requests deterministically lands in one window, without sleeping
 * for a real window to elapse and without touching
 * {@link RateLimitStore}'s real, atomic PostgreSQL statements — this changes
 * what time the application *believes* it is, nothing about how it talks to
 * the database.
 */
final class MutableClock extends Clock {

    private final AtomicReference<Instant> instant;
    private final ZoneId zone;

    private MutableClock(Instant instant, ZoneId zone) {
        this.instant = new AtomicReference<>(instant);
        this.zone = zone;
    }

    static MutableClock startingAt(Instant instant) {
        return new MutableClock(instant, ZoneOffset.UTC);
    }

    /** Pins the clock to exactly this instant. */
    void set(Instant next) {
        instant.set(next);
    }

    /** Moves the clock forward without any real waiting. */
    void advance(Duration duration) {
        instant.updateAndGet(current -> current.plus(duration));
    }

    @Override
    public ZoneId getZone() {
        return zone;
    }

    @Override
    public Clock withZone(ZoneId zone) {
        return new MutableClock(instant.get(), zone);
    }

    @Override
    public Instant instant() {
        return instant.get();
    }
}
