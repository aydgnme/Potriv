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
        @Value("${potriv.backend-console.enabled:false}") boolean backendConsoleEnabled,
        @Value("${potriv.backend-console.username:}") String backendConsoleUsername,
        @Value("${potriv.backend-console.password:}") String backendConsolePassword
    ) {
        validate(jwtSecret, corsAllowedOrigins, datasourceUrl, hibernateDdlAuto,
            backendConsoleEnabled, backendConsoleUsername, backendConsolePassword);
    }

    static void validate(
        String jwtSecret,
        List<String> corsAllowedOrigins,
        String datasourceUrl,
        String hibernateDdlAuto,
        boolean backendConsoleEnabled,
        String backendConsoleUsername,
        String backendConsolePassword
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

        // The embedded monitor console must never run in production with
        // missing or placeholder HTTP Basic credentials.
        if (backendConsoleEnabled) {
            if (backendConsoleUsername == null || backendConsoleUsername.isBlank()
                || backendConsolePassword == null || backendConsolePassword.isBlank()) {
                throw new IllegalStateException(
                    "Production refuses the backend monitor console without explicit "
                        + "credentials. Set BACKEND_CONSOLE_USERNAME and "
                        + "BACKEND_CONSOLE_PASSWORD, or disable the console.");
            }
            String password = backendConsolePassword.toLowerCase(Locale.ROOT);
            if (password.contains("replace-me") || password.contains("change-me")
                || backendConsolePassword.length() < 12) {
                throw new IllegalStateException(
                    "Production refuses a placeholder or short backend console password. "
                        + "Use a strong BACKEND_CONSOLE_PASSWORD of at least 12 characters.");
            }
        }
    }
}
