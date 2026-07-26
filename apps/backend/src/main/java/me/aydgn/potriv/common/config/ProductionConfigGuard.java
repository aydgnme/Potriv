package me.aydgn.potriv.common.config;

import java.util.List;
import java.util.Locale;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Fail-fast validation of security-critical configuration for the {@code prod}
 * profile. The application refuses to boot instead of silently running with
 * development defaults: a placeholder JWT secret, wildcard CORS origins next to
 * credentialed requests, a non-PostgreSQL (in-memory) datasource, or a
 * destructive Hibernate DDL mode that would bypass the Flyway migration
 * strategy.
 */
@Component
@Profile("prod")
public class ProductionConfigGuard {

    // The shared-default secret shipped in application.yml must never sign
    // production tokens.
    private static final String PLACEHOLDER_SECRET_MARKER = "change-this-secret";

    private static final List<String> ALLOWED_DDL_MODES = List.of("validate", "none");

    public ProductionConfigGuard(
        @Value("${app.jwt.secret}") String jwtSecret,
        @Value("${cors.allowed-origins}") List<String> corsAllowedOrigins,
        @Value("${spring.datasource.url}") String datasourceUrl,
        @Value("${spring.jpa.hibernate.ddl-auto:validate}") String hibernateDdlAuto,
        @Value("${potriv.backend-console.enabled:false}") boolean adminConsoleEnabled,
        @Value("${potriv.system-admin.email:}") String systemAdminEmail,
        @Value("${potriv.system-admin.password:}") String systemAdminPassword
    ) {
        validate(jwtSecret, corsAllowedOrigins, datasourceUrl, hibernateDdlAuto,
            adminConsoleEnabled, systemAdminEmail, systemAdminPassword);
    }

    static void validate(
        String jwtSecret,
        List<String> corsAllowedOrigins,
        String datasourceUrl,
        String hibernateDdlAuto,
        boolean adminConsoleEnabled,
        String systemAdminEmail,
        String systemAdminPassword
    ) {
        if (jwtSecret == null
            || jwtSecret.toLowerCase(Locale.ROOT).contains(PLACEHOLDER_SECRET_MARKER)) {
            throw new IllegalStateException(
                "Production refuses the placeholder JWT secret. Set JWT_SECRET to a "
                    + "strong random value of at least 32 bytes.");
        }

        // CORS responses carry credentials, so a wildcard origin is never safe.
        if (corsAllowedOrigins == null || corsAllowedOrigins.isEmpty()
            || corsAllowedOrigins.stream().anyMatch(origin -> origin.contains("*"))) {
            throw new IllegalStateException(
                "Production requires explicit CORS origins (no wildcard). Set "
                    + "CORS_ALLOWED_ORIGINS to the exact frontend origins.");
        }

        if (datasourceUrl == null || !datasourceUrl.startsWith("jdbc:postgresql:")) {
            throw new IllegalStateException(
                "Production requires a PostgreSQL datasource. In-memory or non-PostgreSQL "
                    + "URLs are refused; set DATABASE_URL to a jdbc:postgresql:// URL.");
        }

        // Schema changes in production go through Flyway only.
        if (hibernateDdlAuto == null
            || !ALLOWED_DDL_MODES.contains(hibernateDdlAuto.toLowerCase(Locale.ROOT))) {
            throw new IllegalStateException(
                "Production refuses Hibernate ddl-auto mode '" + hibernateDdlAuto
                    + "'. Use 'validate' (or 'none') and manage schema through Flyway.");
        }

        // The admin console now authenticates via a browser session as the
        // seeded SYSTEM_ADMIN user (no HTTP Basic credentials). When it is
        // enabled in production, that account must have a real strong password.
        if (adminConsoleEnabled) {
            if (systemAdminEmail == null || systemAdminEmail.isBlank()) {
                throw new IllegalStateException(
                    "Production admin console requires a system-admin email. Set "
                        + "SYSTEM_ADMIN_EMAIL, or disable the console.");
            }
            if (systemAdminPassword == null || systemAdminPassword.isBlank()) {
                throw new IllegalStateException(
                    "Production admin console requires a system-admin password. Set "
                        + "SYSTEM_ADMIN_PASSWORD, or disable the console.");
            }
            String password = systemAdminPassword.toLowerCase(Locale.ROOT);
            if (password.contains("replace-me") || password.contains("change-me")
                || password.contains("changeme") || systemAdminPassword.length() < 12) {
                throw new IllegalStateException(
                    "Production refuses a placeholder or short SYSTEM_ADMIN_PASSWORD. "
                        + "Use a strong password of at least 12 characters.");
            }
        }
    }
}
