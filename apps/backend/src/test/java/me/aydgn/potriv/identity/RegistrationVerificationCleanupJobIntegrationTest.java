package me.aydgn.potriv.identity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import me.aydgn.potriv.AbstractIntegrationTest;
import me.aydgn.potriv.identity.service.RegistrationVerificationCleanupJob;

/**
 * {@link RegistrationVerificationCleanupJob} must remove exactly what has
 * fallen out of its 7-day retention — nothing more, nothing less. "Nothing
 * more" matters here for a reason {@code RateLimitCleanupJobIntegrationTest}
 * does not have to argue: a row inside retention holds a real email address
 * and password hash, so deleting it early would not just reset a quota, it
 * would silently discard an in-progress registration.
 */
class RegistrationVerificationCleanupJobIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private RegistrationVerificationCleanupJob cleanupJob;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void doesNotDeleteARowWellWithinRetention() {
        UUID id = insertRow(OffsetDateTime.now(ZoneOffset.UTC).minusHours(1));

        cleanupJob.purgeStale();

        assertThat(count(id)).isEqualTo(1);
    }

    @Test
    void doesNotDeleteARowFromEarlierThisWeek() {
        UUID id = insertRow(OffsetDateTime.now(ZoneOffset.UTC).minusDays(5));

        cleanupJob.purgeStale();

        assertThat(count(id)).isEqualTo(1);
    }

    @Test
    void deletesARowWellPastRetention() {
        UUID id = insertRow(OffsetDateTime.now(ZoneOffset.UTC).minusDays(30));

        cleanupJob.purgeStale();

        assertThat(count(id)).isZero();
    }

    @Test
    void aRowJustInsideRetentionSurvivesAndOneJustOutsideDoesNot() {
        UUID insideId = insertRow(OffsetDateTime.now(ZoneOffset.UTC).minusDays(7).plusMinutes(5));
        UUID outsideId = insertRow(OffsetDateTime.now(ZoneOffset.UTC).minusDays(7).minusMinutes(5));

        cleanupJob.purgeStale();

        assertThat(count(insideId)).as("just inside the 7-day retention").isEqualTo(1);
        assertThat(count(outsideId)).as("just outside the 7-day retention").isZero();
    }

    private UUID insertRow(OffsetDateTime createdAt) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update(
            "insert into registration_verifications "
                + "(id, email, admin_name, organization_name, headquarter_address, "
                + "password_hash, expires_at, delivery_status, attempt_count, "
                + "created_at, updated_at) "
                + "values (?, ?, 'Test Admin', 'Test Org', 'Test HQ', "
                + "'$2a$10$test-only-not-a-real-hash', ?, 'FAILED', 5, ?, ?)",
            id, "cleanup-test-" + id + "@potriv.test",
            createdAt.plusHours(1), createdAt, createdAt);
        return id;
    }

    private int count(UUID id) {
        Integer count = jdbcTemplate.queryForObject(
            "select count(*) from registration_verifications where id = ?", Integer.class, id);
        return count == null ? 0 : count;
    }
}
