package me.aydgn.potriv.ops.schema;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import me.aydgn.potriv.AbstractIntegrationTest;
import me.aydgn.potriv.security.entity.SecurityAuditEventType;

/**
 * The dev drift detector is exercised directly against a real PostgreSQL schema
 * rather than through a profile-specific context: the drift it looks for is a
 * property of the database, and a service-level test keeps the suite fast and
 * stable. The bean itself is `@ConditionalOnProperty`, so it does not exist in
 * the `test` profile at all.
 */
class DevSchemaDriftDetectorIntegrationTest extends AbstractIntegrationTest {

    private static final String CONSTRAINT = "security_audit_events_event_type_check";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    /** Rebuilds the constraint with the complete, current enum value set. */
    @AfterEach
    void restoreConstraint() {
        String values = Arrays.stream(SecurityAuditEventType.values())
            .map(type -> "'" + type.name() + "'")
            .reduce((a, b) -> a + ", " + b)
            .orElseThrow();
        jdbcTemplate.execute("ALTER TABLE security_audit_events DROP CONSTRAINT IF EXISTS "
            + CONSTRAINT);
        jdbcTemplate.execute("ALTER TABLE security_audit_events ADD CONSTRAINT " + CONSTRAINT
            + " CHECK ((event_type)::text = ANY (ARRAY[" + values + "]::text[]))");
    }

    private DevSchemaDriftDetector detector(boolean failFast) {
        return new DevSchemaDriftDetector(
            jdbcTemplate, new DevSchemaDriftProperties(true, failFast));
    }

    /**
     * Recreates the constraint without one value, i.e. an out-of-date dev
     * database. Added {@code NOT VALID} so PostgreSQL does not re-check rows the
     * rest of the suite already wrote — the point is the constraint definition,
     * which is what the detector reads.
     */
    private void dropValueFromConstraint(SecurityAuditEventType omitted) {
        String values = Arrays.stream(SecurityAuditEventType.values())
            .filter(type -> type != omitted)
            .map(type -> "'" + type.name() + "'")
            .reduce((a, b) -> a + ", " + b)
            .orElseThrow();
        jdbcTemplate.execute("ALTER TABLE security_audit_events DROP CONSTRAINT IF EXISTS "
            + CONSTRAINT);
        jdbcTemplate.execute("ALTER TABLE security_audit_events ADD CONSTRAINT " + CONSTRAINT
            + " CHECK ((event_type)::text = ANY (ARRAY[" + values + "]::text[])) NOT VALID");
    }

    @Test
    void upToDateConstraintReportsNoIssue() {
        assertThat(detector(true).inspect()).isEmpty();
    }

    @Test
    void staleConstraintReportsTableColumnAndMissingValue() {
        SecurityAuditEventType omitted = SecurityAuditEventType.SYSTEM_ADMIN_BOOTSTRAP_RECONCILED;
        dropValueFromConstraint(omitted);

        List<SchemaDriftIssue> issues = detector(true).inspect();

        assertThat(issues).hasSize(1);
        SchemaDriftIssue issue = issues.get(0);
        assertThat(issue.table()).isEqualTo("security_audit_events");
        assertThat(issue.column()).isEqualTo("event_type");
        assertThat(issue.missingValues()).containsExactly(omitted.name());
        // The message has to tell a developer what to actually do.
        assertThat(issue.message())
            .contains("schema drift detected")
            .contains(omitted.name())
            .contains("docker compose down --volumes");
    }

    @Test
    void failFastStopsStartupWithTheActionableMessage() {
        SecurityAuditEventType omitted = SecurityAuditEventType.SYSTEM_ADMIN_BOOTSTRAP_CREATED;
        dropValueFromConstraint(omitted);

        assertThatThrownBy(() -> detector(true).run(null))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining(omitted.name())
            .hasMessageContaining("Recreate the local dev database");
    }

    @Test
    void warnOnlyModeDoesNotStopStartup() {
        dropValueFromConstraint(SecurityAuditEventType.SYSTEM_ADMIN_BOOTSTRAP_CREATED);

        assertThatCode(() -> detector(false).run(null)).doesNotThrowAnyException();
    }

    @Test
    void detectorNeverMutatesTheSchema() {
        SecurityAuditEventType omitted = SecurityAuditEventType.SYSTEM_ADMIN_BOOTSTRAP_RECONCILED;
        dropValueFromConstraint(omitted);

        detector(false).run(null);

        // Detect and explain only: repairing the database stays a developer action.
        assertThat(detector(true).inspect()).hasSize(1);
    }
}
