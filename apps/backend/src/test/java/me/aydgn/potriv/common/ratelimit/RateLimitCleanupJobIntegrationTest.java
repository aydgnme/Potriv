package me.aydgn.potriv.common.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import me.aydgn.potriv.AbstractIntegrationTest;

/**
 * {@link RateLimitCleanupJob} must remove exactly what has fallen out of
 * retention — nothing more, nothing less. "Nothing more" is the property this
 * file exists to pin: the job's retention window (2 days) is comfortably
 * longer than any configured rate-limit window or cooldown (the widest in
 * production is the 24h invite daily cap), so a row inside retention is, by
 * construction, still relevant to a live quota decision. Deleting it early
 * would silently reset that quota — the same failure mode as the store simply
 * losing data.
 */
class RateLimitCleanupJobIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private RateLimitCleanupJob cleanupJob;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void doesNotDeleteAWindowRowWellWithinRetention() {
        String bucketKey = "test-window-recent-" + UUID.randomUUID();
        insertWindow(bucketKey, OffsetDateTime.now(ZoneOffset.UTC).minusHours(1));

        cleanupJob.purgeExpired();

        assertThat(countWindow(bucketKey))
            .as("a window row from an hour ago is still well inside any real quota's lifetime")
            .isEqualTo(1);
    }

    @Test
    void doesNotDeleteAWindowRowFromEarlierToday() {
        // The widest real window this application configures is the invite
        // daily cap, 24h. A row this old must still be exactly as alive as
        // one from a minute ago, as far as the cleanup job is concerned.
        String bucketKey = "test-window-today-" + UUID.randomUUID();
        insertWindow(bucketKey, OffsetDateTime.now(ZoneOffset.UTC).minusHours(20));

        cleanupJob.purgeExpired();

        assertThat(countWindow(bucketKey)).isEqualTo(1);
    }

    @Test
    void deletesAWindowRowWellPastRetention() {
        String bucketKey = "test-window-stale-" + UUID.randomUUID();
        insertWindow(bucketKey, OffsetDateTime.now(ZoneOffset.UTC).minusDays(5));

        cleanupJob.purgeExpired();

        assertThat(countWindow(bucketKey)).isZero();
    }

    @Test
    void doesNotDeleteACooldownRowWellWithinRetention() {
        String bucketKey = "test-cooldown-recent-" + UUID.randomUUID();
        insertCooldown(bucketKey, OffsetDateTime.now(ZoneOffset.UTC).minusHours(1));

        cleanupJob.purgeExpired();

        assertThat(countCooldown(bucketKey)).isEqualTo(1);
    }

    @Test
    void deletesACooldownRowWellPastRetention() {
        String bucketKey = "test-cooldown-stale-" + UUID.randomUUID();
        insertCooldown(bucketKey, OffsetDateTime.now(ZoneOffset.UTC).minusDays(5));

        cleanupJob.purgeExpired();

        assertThat(countCooldown(bucketKey)).isZero();
    }

    @Test
    void aRowJustInsideRetentionSurvivesAndOneJustOutsideDoesNot() {
        // The boundary itself, both sides, in one test so the comparison is
        // against the same run's cutoff rather than two separate wall clocks.
        String insideKey = "test-window-boundary-inside-" + UUID.randomUUID();
        String outsideKey = "test-window-boundary-outside-" + UUID.randomUUID();
        insertWindow(insideKey, OffsetDateTime.now(ZoneOffset.UTC).minusDays(2).plusMinutes(5));
        insertWindow(outsideKey, OffsetDateTime.now(ZoneOffset.UTC).minusDays(2).minusMinutes(5));

        cleanupJob.purgeExpired();

        assertThat(countWindow(insideKey)).as("just inside the 2-day retention").isEqualTo(1);
        assertThat(countWindow(outsideKey)).as("just outside the 2-day retention").isZero();
    }

    private void insertWindow(String bucketKey, OffsetDateTime windowStart) {
        jdbcTemplate.update(
            "insert into rate_limit_windows "
                + "(id, bucket_key, window_start, hit_count, created_at, updated_at) "
                + "values (?, ?, ?, 1, ?, ?)",
            UUID.randomUUID(), bucketKey, windowStart, windowStart, windowStart);
    }

    private void insertCooldown(String bucketKey, OffsetDateTime lastHitAt) {
        jdbcTemplate.update(
            "insert into rate_limit_cooldowns (bucket_key, last_hit_at) values (?, ?)",
            bucketKey, lastHitAt);
    }

    private int countWindow(String bucketKey) {
        Integer count = jdbcTemplate.queryForObject(
            "select count(*) from rate_limit_windows where bucket_key = ?", Integer.class, bucketKey);
        return count == null ? 0 : count;
    }

    private int countCooldown(String bucketKey) {
        Integer count = jdbcTemplate.queryForObject(
            "select count(*) from rate_limit_cooldowns where bucket_key = ?", Integer.class, bucketKey);
        return count == null ? 0 : count;
    }
}
