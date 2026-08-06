package me.aydgn.potriv.common.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.actuate.health.HealthComponent;
import org.springframework.boot.actuate.health.HealthEndpoint;
import org.springframework.boot.actuate.health.Status;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;

import me.aydgn.potriv.security.entity.SecurityAuditEvent;
import me.aydgn.potriv.security.entity.SecurityAuditEventType;
import me.aydgn.potriv.security.repository.SecurityAuditEventRepository;

/**
 * Proves the production schema path end to end: an <em>empty</em> PostgreSQL
 * database is initialized by Flyway and then accepted by Hibernate
 * {@code ddl-auto=validate}.
 *
 * <p>This test deliberately runs the real {@code prod} profile — so Flyway,
 * {@code validate}, and {@link ProductionConfigGuard} all apply exactly as they
 * would in production — against its own throwaway container rather than the
 * shared {@code test} one, which is built by Hibernate {@code create-drop} and
 * would therefore prove nothing about the migrations.
 *
 * <p>The only differences from a real deployment are the injected datasource,
 * SMTP, and secret values, which have no schema effect.
 *
 * <p>It also pins the production <em>boot posture</em> that surrounds the schema:
 * the readiness probe the container healthcheck uses must stay UP on an instance
 * that can serve requests, even when outbound mail cannot be reached.
 */
@SpringBootTest
@ActiveProfiles("prod")
class ProductionSchemaMigrationIntegrationTest {

    private static final PostgreSQLContainer<?> MIGRATED_POSTGRES =
        new PostgreSQLContainer<>("postgres:16");

    static {
        MIGRATED_POSTGRES.start();
    }

    /** Every table the current entity model expects the migration to create. */
    private static final List<String> EXPECTED_TABLES = List.of(
        "departments", "department_manager_assignments", "department_memberships",
        "employee_skills", "invite_tokens", "organizations", "password_reset_tokens",
        "projects", "project_allocations", "project_assignment_proposals",
        "project_assignment_proposal_roles", "project_deallocation_proposals",
        "project_status_history", "project_team_role_requirements", "project_technologies",
        "refresh_tokens", "security_audit_events", "skills", "skill_categories",
        "skill_department_links", "team_roles", "users", "user_roles", "user_sessions");

    @DynamicPropertySource
    static void productionLikeProperties(DynamicPropertyRegistry registry) {
        // Datasource: an empty database, so Flyway has to build the whole schema.
        registry.add("spring.datasource.url", MIGRATED_POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", MIGRATED_POSTGRES::getUsername);
        registry.add("spring.datasource.password", MIGRATED_POSTGRES::getPassword);

        // The production posture under test.
        registry.add("spring.flyway.enabled", () -> "true");
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");

        // Values the prod profile requires but that carry no schema meaning.
        registry.add("app.jwt.secret",
            () -> "test-only-production-schema-secret-with-plenty-of-entropy-0123456789");
        registry.add("cors.allowed-origins", () -> "https://potriv.aydgn.me");
        registry.add("app.mail.from", () -> "no-reply@potriv.test");
        registry.add("spring.mail.host", () -> "localhost");
        registry.add("spring.mail.port", () -> "1025");
        registry.add("spring.mail.username", () -> "");
        registry.add("spring.mail.password", () -> "");
    }

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private SecurityAuditEventRepository securityAuditEventRepository;

    @Test
    void flywayBuildsASchemaHibernateValidateAccepts() {
        // Reaching this point already proves it: the context only starts when
        // Flyway has migrated and Hibernate's validate found every mapping.
        List<String> applied = jdbcTemplate.queryForList(
            "select version from flyway_schema_history where success = true order by installed_rank",
            String.class);

        assertThat(applied).contains("1", "2");
        assertThat(jdbcTemplate.queryForObject(
            "select count(*) from flyway_schema_history where success = false", Integer.class))
            .isZero();
    }

    @Test
    void migrationCreatesEveryExpectedTable() {
        List<String> tables = jdbcTemplate.queryForList(
            "select table_name from information_schema.tables where table_schema = current_schema()",
            String.class);

        assertThat(tables).containsAll(EXPECTED_TABLES);
    }

    /**
     * The drift guard. Hibernate emits a CHECK constraint listing every enum
     * constant, and {@code ddl-auto=update} never refreshes it — which is how
     * dev databases repeatedly rejected new {@code ADMIN_*} audit events. If a
     * new constant is added without a migration refreshing the constraint, this
     * fails instead of surfacing in production.
     */
    @Test
    void auditEventTypeCheckConstraintCoversEveryEnumConstant() {
        String constraint = jdbcTemplate.queryForObject(
            "select pg_get_constraintdef(c.oid) from pg_constraint c "
                + "where c.conrelid = 'security_audit_events'::regclass and c.contype = 'c' "
                + "and pg_get_constraintdef(c.oid) like '%event_type%'",
            String.class);

        assertThat(constraint).isNotNull();
        for (SecurityAuditEventType type : SecurityAuditEventType.values()) {
            assertThat(constraint)
                .as("migration CHECK constraint must allow %s", type)
                .contains("'" + type.name() + "'");
        }
    }

    /** The constraint must also accept a real write, not just look correct. */
    @Test
    void newestAuditEventTypePersistsAgainstTheMigratedSchema() {
        SecurityAuditEvent event = SecurityAuditEvent
            .builder(SecurityAuditEventType.ADMIN_USER_ROLE_ACTION_BLOCKED, false)
            .details("production schema migration validation")
            .build();

        assertThat(securityAuditEventRepository.save(event).getId()).isNotNull();
    }

    // ------------------------------------------------- Production boot probe

    @Autowired
    private HealthEndpoint healthEndpoint;

    /**
     * Regression for a real production defect: the container healthcheck hit the
     * <em>aggregate</em> health endpoint, which includes Spring Boot's mail
     * contributor. With the shipped `.env.prod.example` the SMTP placeholder
     * cannot authenticate, so a backend that was serving every request — Flyway
     * applied, `/api/auth/login` answering — was reported DOWN and the container
     * marked unhealthy. An orchestrator would restart or de-route a healthy
     * instance on any SMTP blip.
     *
     * <p>This test runs the real prod profile with an unreachable SMTP host, the
     * same condition that produced the failure.
     */
    @Test
    void readinessProbeStaysUpWhenOutboundMailIsUnreachable() {
        HealthComponent readiness = healthEndpoint.healthForPath("readiness");

        assertThat(readiness)
            .as("the prod profile must define the readiness group the container probes")
            .isNotNull();
        assertThat(readiness.getStatus()).isEqualTo(Status.UP);
    }

    /**
     * The counterpart: mail is still *reported*, just not allowed to gate the
     * probe. If this ever stops being DOWN here the test above proves less, so the
     * two are asserted together.
     */
    @Test
    void theAggregateStillReportsOutboundMailSoItsStateRemainsVisible() {
        assertThat(healthEndpoint.health().getStatus()).isEqualTo(Status.DOWN);
    }
}
