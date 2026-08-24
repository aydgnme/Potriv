package me.aydgn.potriv.identity.service;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Keeps {@code registration_verifications} bounded, and bounds how long a
 * resolved row's {@code password_hash} and email address linger anywhere.
 *
 * Every row this deletes has long since reached an outcome: confirmed
 * (redeemed, and {@code confirmRegistration} rolls a redeemed row's own
 * {@code used_at} into the account it created — nothing about the account
 * itself depends on this row surviving), expired unconfirmed, suppressed
 * because the address was already registered, or failed after every retry.
 * {@link #RETENTION} is deliberately shorter than {@code RateLimitCleanupJob}
 * 's: this table, unlike the rate limiter's, holds an email address and a
 * password hash, so there is a data-minimisation reason to let it go sooner,
 * not only a table-size one. Seven days is comfortably longer than this
 * flow's own token lifetime (app.auth.registration-verification-minutes,
 * 60 by default) and its delivery-retry window, so nothing still needed for
 * an in-progress registration is ever at risk of being swept up early.
 */
@Component
public class RegistrationVerificationCleanupJob {

    private static final Logger log =
        LoggerFactory.getLogger(RegistrationVerificationCleanupJob.class);

    private static final Duration RETENTION = Duration.ofDays(7);

    private final JdbcTemplate jdbcTemplate;

    public RegistrationVerificationCleanupJob(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Scheduled(
        fixedDelayString = "${app.registration-verification-cleanup.interval-ms:3600000}")
    public void purgeStale() {
        OffsetDateTime cutoff = OffsetDateTime.now(ZoneOffset.UTC).minus(RETENTION);

        int removed = jdbcTemplate.update(
            "delete from registration_verifications where created_at < ?", cutoff);

        if (removed > 0) {
            log.info("Registration-verification cleanup removed {} row(s).", removed);
        }
    }
}
