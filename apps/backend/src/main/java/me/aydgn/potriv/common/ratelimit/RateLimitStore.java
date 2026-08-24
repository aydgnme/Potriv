package me.aydgn.potriv.common.ratelimit;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * The two atomic primitives every quota in this application is built from.
 *
 * Both are single SQL statements — an {@code INSERT ... ON CONFLICT}, in each
 * case — because that is what makes them safe to call from every application
 * instance at once without any coordination between them: PostgreSQL itself
 * serialises concurrent writers to the same row, so "did this request arrive
 * within quota" is answered by the database, not raced out by whichever
 * instance's Java happened to run first.
 */
@Component
class RateLimitStore {

    private final JdbcTemplate jdbcTemplate;

    RateLimitStore(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * Increments the counter for the window {@code bucketKey} falls into right
     * now, creating that window's row on first use, and returns the count
     * after this hit.
     *
     * The window is identified by its own start instant — {@code now} floored
     * to a multiple of {@code windowSeconds} — rather than a rolling
     * "count in the last N seconds," which would need every past hit kept
     * individually to recompute. A fixed window is coarser at the boundary (a
     * burst can land two windows' worth of requests either side of the exact
     * edge) in exchange for being one row and one statement; the "short"
     * window on every quota in this application exists specifically to absorb
     * that edge case, not to be precise to the second.
     */
    int incrementWindow(String bucketKey, Instant now, Duration window) {
        long windowSeconds = window.getSeconds();
        Instant windowStart = Instant.ofEpochSecond(
            now.getEpochSecond() / windowSeconds * windowSeconds);

        List<Integer> updated = jdbcTemplate.query(
            """
            insert into rate_limit_windows (id, bucket_key, window_start, hit_count, created_at, updated_at)
            values (?, ?, ?, 1, ?, ?)
            on conflict (bucket_key, window_start)
            do update set hit_count = rate_limit_windows.hit_count + 1, updated_at = excluded.updated_at
            returning hit_count
            """,
            (rs, rowNum) -> rs.getInt(1),
            UUID.randomUUID(), bucketKey, java.sql.Timestamp.from(windowStart),
            java.sql.Timestamp.from(now), java.sql.Timestamp.from(now));

        return updated.get(0);
    }

    /**
     * Tries to acquire a cooldown for {@code bucketKey}: succeeds, and records
     * {@code now} as the last hit, only if no hit is on record or the
     * recorded one is already older than {@code cooldown}.
     *
     * One statement decides the outcome — the {@code where} clause on the
     * conflict action is what makes "acquire only if the cooldown has
     * elapsed" atomic rather than a read followed by a conditional write,
     * which two concurrent requests could both pass before either had
     * written anything. A denial needs a second, read-only query to report
     * how long the caller must wait; that query cannot itself decide the
     * outcome; it only explains a decision already made.
     */
    boolean tryAcquireCooldown(String bucketKey, Instant now, Duration cooldown) {
        List<java.sql.Timestamp> acquired = jdbcTemplate.query(
            """
            insert into rate_limit_cooldowns (bucket_key, last_hit_at)
            values (?, ?)
            on conflict (bucket_key)
            do update set last_hit_at = excluded.last_hit_at
            where rate_limit_cooldowns.last_hit_at <= ?
            returning last_hit_at
            """,
            (rs, rowNum) -> rs.getTimestamp(1),
            bucketKey, java.sql.Timestamp.from(now),
            java.sql.Timestamp.from(now.minus(cooldown)));

        return !acquired.isEmpty();
    }

    /** Read-only: how long until {@code bucketKey}'s cooldown next elapses. */
    Duration remainingCooldown(String bucketKey, Instant now, Duration cooldown) {
        List<java.sql.Timestamp> rows = jdbcTemplate.query(
            "select last_hit_at from rate_limit_cooldowns where bucket_key = ?",
            (rs, rowNum) -> rs.getTimestamp(1),
            bucketKey);
        if (rows.isEmpty()) {
            return Duration.ZERO;
        }
        Instant elapses = rows.get(0).toInstant().plus(cooldown);
        Duration remaining = Duration.between(now, elapses);
        return remaining.isNegative() ? Duration.ZERO : remaining;
    }

    /** How long until the current window for {@code bucketKey} rolls over. */
    Duration remainingWindow(Instant now, Duration window) {
        long windowSeconds = window.getSeconds();
        long elapsedInWindow = now.getEpochSecond() % windowSeconds;
        return Duration.ofSeconds(windowSeconds - elapsedInWindow);
    }
}
