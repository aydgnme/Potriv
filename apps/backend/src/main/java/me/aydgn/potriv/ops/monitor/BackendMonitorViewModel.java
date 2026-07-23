package me.aydgn.potriv.ops.monitor;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * Everything the monitor page renders. All values are pre-sanitized by
 * {@link BackendMonitorService} — no secrets, credentials, or business data.
 */
public record BackendMonitorViewModel(
    String environment,
    OffsetDateTime generatedAt,
    BackendMonitorHealthSnapshot health,
    BackendMonitorRuntimeSnapshot runtime,
    BackendMonitorDatabaseSnapshot database,
    BackendMonitorFlywaySnapshot flyway,
    BackendMonitorSecuritySnapshot security,
    List<BackendMonitorReadinessItem> readiness
) {

    public record BackendMonitorHealthSnapshot(
        String applicationStatus,
        String actuatorHealthPath
    ) {
    }

    public record BackendMonitorRuntimeSnapshot(
        String javaVersion,
        List<String> activeProfiles,
        int availableProcessors,
        String memoryUsed,
        String memoryMax,
        String uptime,
        String applicationVersion
    ) {
    }

    public record BackendMonitorDatabaseSnapshot(
        String connectivity,
        String productName,
        String sanitizedJdbcUrl,
        String hibernateDdlAuto
    ) {
    }

    public record BackendMonitorFlywaySnapshot(
        boolean enabled,
        String currentVersion,
        int appliedCount,
        int pendingCount,
        int failedCount,
        String state
    ) {
    }

    public record BackendMonitorSecuritySnapshot(
        boolean jwtSecretConfigured,
        String jwtIssuer,
        String accessTokenTtl,
        String refreshTokenTtl,
        List<String> corsAllowedOrigins,
        boolean swaggerEnabled,
        String actuatorExposure,
        boolean backendConsoleEnabled
    ) {
    }

    public record BackendMonitorReadinessItem(
        String status,
        String label,
        String explanation
    ) {

        public static BackendMonitorReadinessItem pass(String label, String explanation) {
            return new BackendMonitorReadinessItem("PASS", label, explanation);
        }

        public static BackendMonitorReadinessItem warn(String label, String explanation) {
            return new BackendMonitorReadinessItem("WARN", label, explanation);
        }

        public static BackendMonitorReadinessItem fail(String label, String explanation) {
            return new BackendMonitorReadinessItem("FAIL", label, explanation);
        }
    }
}
