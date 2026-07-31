package me.aydgn.potriv.ops.schema;

import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import me.aydgn.potriv.security.entity.SecurityAuditEventType;

/**
 * Detects stale enum {@code CHECK} constraints in a development database.
 *
 * <p>Development runs Hibernate {@code ddl-auto: update}, which creates a
 * constraint once and then never refreshes it. Adding an enum constant therefore
 * leaves an older local database silently unable to store the new value: the
 * application starts happily and then fails on the first write that uses it.
 * That really happened while the {@code ADMIN_*} audit events were added, and it
 * cost manual database surgery to diagnose.
 *
 * <p>This detector turns that late, confusing failure into an immediate,
 * actionable one. It only ever <em>reads</em> the catalog — schema changes stay
 * an explicit developer action, never an automatic {@code ALTER TABLE}.
 *
 * <p>The bean exists only when {@code potriv.dev.schema-drift.enabled=true},
 * which {@code application-dev.yml} sets. Production and tests leave it off:
 * production's schema is owned by Flyway and already validated by Hibernate, and
 * {@code ProductionSchemaMigrationIntegrationTest} guards the migration itself.
 */
@Component
@ConditionalOnProperty(prefix = "potriv.dev.schema-drift", name = "enabled", havingValue = "true")
public class DevSchemaDriftDetector implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DevSchemaDriftDetector.class);

    private static final String AUDIT_TABLE = "security_audit_events";
    private static final String AUDIT_COLUMN = "event_type";

    private final JdbcTemplate jdbcTemplate;
    private final DevSchemaDriftProperties properties;

    public DevSchemaDriftDetector(
        JdbcTemplate jdbcTemplate, DevSchemaDriftProperties properties) {
        this.jdbcTemplate = jdbcTemplate;
        this.properties = properties;
    }

    @Override
    public void run(ApplicationArguments args) {
        List<SchemaDriftIssue> issues = inspect();
        if (issues.isEmpty()) {
            return;
        }
        issues.forEach(issue -> log.error("{}", issue.message()));

        if (properties.failFast()) {
            // Failing the boot is deliberate: starting up would only defer the
            // error to the first audited write, far from its cause.
            throw new IllegalStateException(issues.get(0).message());
        }
        log.warn("Continuing despite schema drift because"
            + " potriv.dev.schema-drift.fail-fast=false. Writes using the missing"
            + " values will fail until the database is refreshed.");
    }

    /**
     * Reads the enum {@code CHECK} constraints this detector knows about and
     * reports every application value the database would reject. Public so it can
     * be exercised directly, without a profile-dependent application context.
     */
    public List<SchemaDriftIssue> inspect() {
        List<SchemaDriftIssue> issues = new ArrayList<>();
        missingValues(AUDIT_TABLE, AUDIT_COLUMN,
            java.util.Arrays.stream(SecurityAuditEventType.values())
                .map(Enum::name).toList())
            .ifPresent(missing ->
                issues.add(new SchemaDriftIssue(AUDIT_TABLE, AUDIT_COLUMN, missing)));
        return issues;
    }

    private java.util.Optional<List<String>> missingValues(
        String table, String column, List<String> expected) {
        String definition = constraintDefinition(table, column);
        if (definition == null) {
            // No CHECK constraint at all: nothing constrains the column, so the
            // database cannot reject a value. Not drift.
            return java.util.Optional.empty();
        }
        List<String> missing = expected.stream()
            .filter(value -> !definition.contains("'" + value + "'"))
            .toList();
        return missing.isEmpty() ? java.util.Optional.empty() : java.util.Optional.of(missing);
    }

    private String constraintDefinition(String table, String column) {
        try {
            List<String> definitions = jdbcTemplate.queryForList(
                "select pg_get_constraintdef(c.oid) from pg_constraint c"
                    + " where c.conrelid = ?::regclass and c.contype = 'c'"
                    + " and pg_get_constraintdef(c.oid) like ?",
                String.class, table, "%" + column + "%");
            return definitions.isEmpty() ? null : definitions.get(0);
        } catch (RuntimeException exception) {
            // A missing table or a non-PostgreSQL datasource is not this
            // component's problem to report; stay silent rather than block a boot
            // for an unrelated reason.
            log.debug("Skipping schema drift check for {}.{}: {}",
                table, column, exception.getMessage());
            return null;
        }
    }
}
