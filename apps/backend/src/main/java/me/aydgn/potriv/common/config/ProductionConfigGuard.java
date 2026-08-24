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
 * credentialed requests, a non-PostgreSQL (in-memory) datasource, a destructive
 * Hibernate DDL mode that would bypass the Flyway migration strategy, or an
 * unconfigured trusted-proxy boundary that would quietly collapse every
 * IP-scoped rate limit into one shared bucket.
 */
@Component
@Profile("prod")
public class ProductionConfigGuard {

    // The shared-default secret shipped in application.yml must never sign
    // production tokens, or key production's rate-limit buckets.
    private static final String PLACEHOLDER_SECRET_MARKER = "change-this-secret";

    private static final List<String> ALLOWED_DDL_MODES = List.of("validate", "none");

    public ProductionConfigGuard(
        @Value("${app.jwt.secret}") String jwtSecret,
        @Value("${cors.allowed-origins}") List<String> corsAllowedOrigins,
        @Value("${spring.datasource.url}") String datasourceUrl,
        @Value("${spring.jpa.hibernate.ddl-auto:validate}") String hibernateDdlAuto,
        @Value("${potriv.backend-console.enabled:false}") boolean adminConsoleEnabled,
        @Value("${potriv.system-admin.email:}") String systemAdminEmail,
        @Value("${potriv.system-admin.password:}") String systemAdminPassword,
        @Value("${app.rate-limit.enabled:false}") boolean rateLimitEnabled,
        @Value("${app.rate-limit.hmac-secret:}") String rateLimitHmacSecret,
        @Value("${app.rate-limit.trusted-proxies:}") String rateLimitTrustedProxies,
        @Value("${app.rate-limit.no-reverse-proxy:false}") boolean rateLimitNoReverseProxy
    ) {
        validate(jwtSecret, corsAllowedOrigins, datasourceUrl, hibernateDdlAuto,
            adminConsoleEnabled, systemAdminEmail, systemAdminPassword,
            rateLimitEnabled, rateLimitHmacSecret,
            rateLimitTrustedProxies, rateLimitNoReverseProxy);
    }

    static void validate(
        String jwtSecret,
        List<String> corsAllowedOrigins,
        String datasourceUrl,
        String hibernateDdlAuto,
        boolean adminConsoleEnabled,
        String systemAdminEmail,
        String systemAdminPassword,
        boolean rateLimitEnabled,
        String rateLimitHmacSecret,
        String rateLimitTrustedProxies,
        boolean rateLimitNoReverseProxy
    ) {
        if (jwtSecret == null
            || jwtSecret.toLowerCase(Locale.ROOT).contains(PLACEHOLDER_SECRET_MARKER)) {
            throw new IllegalStateException(
                "Production refuses the placeholder JWT secret. Set JWT_SECRET to a "
                    + "strong random value of at least 32 bytes.");
        }

        // A disabled limiter is itself a deliberately reachable state — see the
        // fail-open/fail-closed note on RateLimitProperties — but a placeholder
        // secret protecting nobody's inbox address is not.
        if (rateLimitEnabled
            && (rateLimitHmacSecret == null || rateLimitHmacSecret.isBlank()
                || rateLimitHmacSecret.toLowerCase(Locale.ROOT).contains(PLACEHOLDER_SECRET_MARKER))) {
            throw new IllegalStateException(
                "Production refuses the placeholder rate-limit HMAC secret. Set "
                    + "RATE_LIMIT_HMAC_SECRET to a strong random value, or set "
                    + "RATE_LIMIT_ENABLED=false if rate limiting is deliberately off.");
        }

        // IP-scoped quotas are only as good as the address ClientIpResolver hands
        // back. Left unconfigured, RATE_LIMIT_TRUSTED_PROXIES silently degrades
        // into "every caller behind the real reverse proxy shares one bucket
        // keyed on the proxy's own address" — it does not fail open, but it
        // defeats the per-caller intent of every quota below without anything
        // ever saying so. An operator must say, on purpose, which of the two
        // topologies this deployment actually has.
        boolean hasTrustedProxies = rateLimitTrustedProxies != null
            && !rateLimitTrustedProxies.isBlank();
        if (rateLimitEnabled && hasTrustedProxies && rateLimitNoReverseProxy) {
            throw new IllegalStateException(
                "Production rate limiting cannot have both RATE_LIMIT_TRUSTED_PROXIES set "
                    + "and RATE_LIMIT_NO_REVERSE_PROXY=true: these describe contradictory "
                    + "deployment topologies. Set exactly one.");
        }
        if (rateLimitEnabled && !hasTrustedProxies && !rateLimitNoReverseProxy) {
            throw new IllegalStateException(
                "Production rate limiting is enabled but RATE_LIMIT_TRUSTED_PROXIES is not "
                    + "set. Set it to this deployment's real front-door/gateway CIDR ranges, "
                    + "or set RATE_LIMIT_NO_REVERSE_PROXY=true if this backend is deliberately "
                    + "reachable directly from the internet with no reverse proxy in front.");
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
