package me.aydgn.potriv.common.ratelimit;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Keeps {@code rate_limit_windows} and {@code rate_limit_cooldowns} the size
 * of recent traffic, not of all traffic ever received.
 *
 * Every row either primitive writes is one this application will only ever
 * read again while it is still relevant to a decision — a window row once its
 * window has passed, a cooldown row once its cooldown has elapsed — so
 * anything old enough to fall outside {@link #RETENTION} is provably dead
 * weight, not data that might still be needed.
 */
@Component
public class RateLimitCleanupJob {

    private static final Logger log = LoggerFactory.getLogger(RateLimitCleanupJob.class);

    /** Comfortably longer than any configured window or cooldown. */
    private static final Duration RETENTION = Duration.ofDays(2);

    private final JdbcTemplate jdbcTemplate;

    public RateLimitCleanupJob(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Scheduled(fixedDelayString = "${app.rate-limit.cleanup-interval-ms:3600000}")
    public void purgeExpired() {
        OffsetDateTime cutoff = OffsetDateTime.now(ZoneOffset.UTC).minus(RETENTION);

        int windows = jdbcTemplate.update(
            "delete from rate_limit_windows where window_start < ?", cutoff);
        int cooldowns = jdbcTemplate.update(
            "delete from rate_limit_cooldowns where last_hit_at < ?", cutoff);

        if (windows > 0 || cooldowns > 0) {
            log.info("Rate-limit cleanup removed {} window rows and {} cooldown rows.",
                windows, cooldowns);
        }
    }
}
