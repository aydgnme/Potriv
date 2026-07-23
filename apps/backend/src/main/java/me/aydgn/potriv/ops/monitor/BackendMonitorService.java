package me.aydgn.potriv.ops.monitor;

import java.lang.management.ManagementFactory;
import java.sql.Connection;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

import javax.sql.DataSource;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationInfo;
import org.flywaydb.core.api.MigrationInfoService;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.actuate.health.HealthEndpoint;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

import me.aydgn.potriv.common.config.JwtProperties;
import me.aydgn.potriv.ops.monitor.BackendMonitorViewModel.BackendMonitorDatabaseSnapshot;
import me.aydgn.potriv.ops.monitor.BackendMonitorViewModel.BackendMonitorFlywaySnapshot;
import me.aydgn.potriv.ops.monitor.BackendMonitorViewModel.BackendMonitorHealthSnapshot;
import me.aydgn.potriv.ops.monitor.BackendMonitorViewModel.BackendMonitorReadinessItem;
import me.aydgn.potriv.ops.monitor.BackendMonitorViewModel.BackendMonitorRuntimeSnapshot;
import me.aydgn.potriv.ops.monitor.BackendMonitorViewModel.BackendMonitorSecuritySnapshot;

/**
 * Collects the read-only, pre-sanitized snapshot rendered by the monitor page.
 * Expected infrastructure failures (database down, Flyway unavailable) are
 * reported as FAILED/UNKNOWN rows instead of breaking the page.
 */
@Service
public class BackendMonitorService {

    private static final String PLACEHOLDER_SECRET_MARKER = "change-this-secret";

    private final Environment environment;
    private final DataSource dataSource;
    private final ObjectProvider<Flyway> flywayProvider;
    private final ObjectProvider<HealthEndpoint> healthEndpointProvider;
    private final JwtProperties jwtProperties;
    private final BackendMonitorProperties monitorProperties;
    private final Clock clock;

    public BackendMonitorService(
        Environment environment,
        DataSource dataSource,
        ObjectProvider<Flyway> flywayProvider,
        ObjectProvider<HealthEndpoint> healthEndpointProvider,
        JwtProperties jwtProperties,
        BackendMonitorProperties monitorProperties,
        Clock clock
    ) {
        this.environment = environment;
        this.dataSource = dataSource;
        this.flywayProvider = flywayProvider;
        this.healthEndpointProvider = healthEndpointProvider;
        this.jwtProperties = jwtProperties;
        this.monitorProperties = monitorProperties;
        this.clock = clock;
    }

    public BackendMonitorViewModel snapshot() {
        BackendMonitorDatabaseSnapshot database = databaseSnapshot();
        BackendMonitorFlywaySnapshot flyway = flywaySnapshot();
        BackendMonitorSecuritySnapshot security = securitySnapshot();

        return new BackendMonitorViewModel(
            environmentLabel(),
            OffsetDateTime.now(clock),
            healthSnapshot(),
            runtimeSnapshot(),
            database,
            flyway,
            security,
            readiness(database, flyway, security));
    }

    // ---- sections ----

    private String environmentLabel() {
        List<String> profiles = Arrays.asList(environment.getActiveProfiles());
        if (profiles.contains("prod")) {
            return "prod";
        }
        if (profiles.contains("test")) {
            return "test";
        }
        if (profiles.contains("dev")) {
            return "dev";
        }
        return profiles.isEmpty() ? "unknown" : profiles.getFirst();
    }

    private BackendMonitorHealthSnapshot healthSnapshot() {
        String status = "UNKNOWN";
        HealthEndpoint healthEndpoint = healthEndpointProvider.getIfAvailable();
        if (healthEndpoint != null) {
            try {
                status = healthEndpoint.health().getStatus().getCode();
            } catch (RuntimeException exception) {
                status = "UNKNOWN";
            }
        }
        return new BackendMonitorHealthSnapshot(status, "/api/actuator/health");
    }

    private BackendMonitorRuntimeSnapshot runtimeSnapshot() {
        Runtime runtime = Runtime.getRuntime();
        long usedBytes = runtime.totalMemory() - runtime.freeMemory();
        Duration uptime = Duration.ofMillis(ManagementFactory.getRuntimeMXBean().getUptime());
        return new BackendMonitorRuntimeSnapshot(
            System.getProperty("java.version", "unknown"),
            Arrays.asList(environment.getActiveProfiles()),
            runtime.availableProcessors(),
            formatBytes(usedBytes),
            formatBytes(runtime.maxMemory()),
            formatUptime(uptime),
            environment.getProperty("spring.application.name", "potriv-backend"));
    }

    private BackendMonitorDatabaseSnapshot databaseSnapshot() {
        String ddlAuto = environment.getProperty("spring.jpa.hibernate.ddl-auto", "unknown");
        try (Connection connection = dataSource.getConnection()) {
            return new BackendMonitorDatabaseSnapshot(
                "OK",
                connection.getMetaData().getDatabaseProductName(),
                sanitizeJdbcUrl(connection.getMetaData().getURL()),
                ddlAuto);
        } catch (Exception exception) {
            return new BackendMonitorDatabaseSnapshot(
                "FAILED",
                "unknown",
                sanitizeJdbcUrl(environment.getProperty("spring.datasource.url", "")),
                ddlAuto);
        }
    }

    private BackendMonitorFlywaySnapshot flywaySnapshot() {
        Flyway flyway = flywayProvider.getIfAvailable();
        boolean enabled = environment.getProperty("spring.flyway.enabled", Boolean.class, false);
        if (flyway == null) {
            return new BackendMonitorFlywaySnapshot(
                enabled, "none", 0, 0, 0, enabled ? "UNKNOWN" : "DISABLED");
        }
        try {
            MigrationInfoService info = flyway.info();
            MigrationInfo current = info.current();
            int failed = (int) Arrays.stream(info.all())
                .filter(migration -> migration.getState().isFailed())
                .count();
            return new BackendMonitorFlywaySnapshot(
                enabled,
                current == null ? "none" : String.valueOf(current.getVersion()),
                info.applied().length,
                info.pending().length,
                failed,
                failed > 0 ? "FAILED" : "OK");
        } catch (RuntimeException exception) {
            return new BackendMonitorFlywaySnapshot(enabled, "unknown", 0, 0, 0, "UNKNOWN");
        }
    }

    private BackendMonitorSecuritySnapshot securitySnapshot() {
        return new BackendMonitorSecuritySnapshot(
            jwtSecretConfigured(),
            jwtProperties.issuer(),
            jwtProperties.accessTokenMinutes() + " minutes",
            jwtProperties.refreshTokenDays() + " days",
            corsAllowedOrigins(),
            swaggerEnabled(),
            environment.getProperty(
                "management.endpoints.web.exposure.include", "health,info,metrics"),
            monitorProperties.enabled());
    }

    // ---- readiness ----

    private List<BackendMonitorReadinessItem> readiness(
        BackendMonitorDatabaseSnapshot database,
        BackendMonitorFlywaySnapshot flyway,
        BackendMonitorSecuritySnapshot security
    ) {
        boolean prod = Arrays.asList(environment.getActiveProfiles()).contains("prod");
        List<BackendMonitorReadinessItem> items = new ArrayList<>();

        items.add(prod
            ? BackendMonitorReadinessItem.pass("Prod profile active", "prod profile is active")
            : BackendMonitorReadinessItem.warn("Prod profile active",
                "running with non-prod profiles — expected outside production"));

        items.add(jwtSecretConfigured()
            ? BackendMonitorReadinessItem.pass("JWT secret not placeholder",
                "a non-placeholder signing secret is configured")
            : BackendMonitorReadinessItem.fail("JWT secret not placeholder",
                "the shared-default placeholder secret is in use"));

        boolean postgres = database.sanitizedJdbcUrl().startsWith("jdbc:postgresql:");
        items.add(postgres
            ? BackendMonitorReadinessItem.pass("Datasource is PostgreSQL",
                "datasource URL targets PostgreSQL")
            : BackendMonitorReadinessItem.fail("Datasource is PostgreSQL",
                "datasource is not a PostgreSQL URL"));

        String ddlAuto = database.hibernateDdlAuto().toLowerCase(Locale.ROOT);
        boolean safeDdl = ddlAuto.equals("validate") || ddlAuto.equals("none");
        items.add(safeDdl
            ? BackendMonitorReadinessItem.pass("Hibernate ddl-auto safe",
                "ddl-auto is '" + ddlAuto + "' — schema managed by Flyway")
            : (prod
                ? BackendMonitorReadinessItem.fail("Hibernate ddl-auto safe",
                    "ddl-auto is '" + ddlAuto + "' — production requires validate/none")
                : BackendMonitorReadinessItem.warn("Hibernate ddl-auto safe",
                    "ddl-auto is '" + ddlAuto + "' — acceptable for code-first development only")));

        items.add(flyway.enabled()
            ? BackendMonitorReadinessItem.pass("Flyway enabled",
                flyway.appliedCount() + " applied, " + flyway.pendingCount() + " pending")
            : (prod
                ? BackendMonitorReadinessItem.fail("Flyway enabled",
                    "Flyway is disabled — production schema must be migration-managed")
                : BackendMonitorReadinessItem.warn("Flyway enabled",
                    "Flyway is disabled in this profile (dev/test are code-first)")));

        boolean wildcardCors = security.corsAllowedOrigins().stream()
            .anyMatch(origin -> origin.contains("*"));
        items.add(wildcardCors
            ? BackendMonitorReadinessItem.fail("CORS without wildcard",
                "a wildcard origin is configured while responses carry credentials")
            : BackendMonitorReadinessItem.pass("CORS without wildcard",
                security.corsAllowedOrigins().size() + " explicit origin(s)"));

        items.add(!security.swaggerEnabled()
            ? BackendMonitorReadinessItem.pass("Swagger exposure",
                "OpenAPI/Swagger is disabled")
            : (prod
                ? BackendMonitorReadinessItem.warn("Swagger exposure",
                    "Swagger is enabled in production — confirm this is intentional")
                : BackendMonitorReadinessItem.pass("Swagger exposure",
                    "Swagger is enabled (expected for dev/test)")));

        String exposure = security.actuatorExposure().replace(" ", "");
        boolean restricted = exposure.equals("health") || exposure.equals("health,info");
        items.add(restricted
            ? BackendMonitorReadinessItem.pass("Actuator exposure restricted",
                "exposed endpoints: " + exposure)
            : (prod
                ? BackendMonitorReadinessItem.warn("Actuator exposure restricted",
                    "exposed endpoints: " + exposure + " — restrict to health in production")
                : BackendMonitorReadinessItem.pass("Actuator exposure restricted",
                    "exposed endpoints: " + exposure + " (dev/test default)")));

        if (!monitorProperties.enabled()) {
            items.add(BackendMonitorReadinessItem.pass("Monitor console protection",
                "console is disabled"));
        } else if (monitorProperties.hasCredentials()) {
            items.add(BackendMonitorReadinessItem.pass("Monitor console protection",
                "console requires explicit HTTP Basic credentials"));
        } else {
            items.add(BackendMonitorReadinessItem.fail("Monitor console protection",
                "console is enabled without explicit credentials"));
        }

        return items;
    }

    // ---- helpers ----

    private boolean jwtSecretConfigured() {
        String secret = jwtProperties.secret();
        return secret != null && !secret.isBlank()
            && !secret.toLowerCase(Locale.ROOT).contains(PLACEHOLDER_SECRET_MARKER);
    }

    private List<String> corsAllowedOrigins() {
        String origins = environment.getProperty("cors.allowed-origins", "");
        return Arrays.stream(origins.split(","))
            .map(String::trim)
            .filter(origin -> !origin.isEmpty())
            .toList();
    }

    private boolean swaggerEnabled() {
        // Springdoc defaults to enabled unless the property disables it.
        return environment.getProperty("springdoc.api-docs.enabled", Boolean.class, true);
    }

    /**
     * Reduces a JDBC URL to scheme, host, port, and database name. Credentials
     * and query parameters are never rendered.
     */
    static String sanitizeJdbcUrl(String url) {
        if (url == null || url.isBlank()) {
            return "unknown";
        }
        String sanitized = url;
        int queryStart = sanitized.indexOf('?');
        if (queryStart >= 0) {
            sanitized = sanitized.substring(0, queryStart);
        }
        // Strip any user:password@ section defensively.
        sanitized = sanitized.replaceFirst("//[^/@]+@", "//");
        return sanitized;
    }

    private static String formatBytes(long bytes) {
        return (bytes / (1024 * 1024)) + " MB";
    }

    private static String formatUptime(Duration uptime) {
        long hours = uptime.toHours();
        long minutes = uptime.toMinutesPart();
        long seconds = uptime.toSecondsPart();
        if (hours > 0) {
            return hours + "h " + minutes + "m " + seconds + "s";
        }
        if (minutes > 0) {
            return minutes + "m " + seconds + "s";
        }
        return seconds + "s";
    }
}
