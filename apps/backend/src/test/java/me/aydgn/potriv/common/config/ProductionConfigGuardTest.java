package me.aydgn.potriv.common.config;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.Test;

/**
 * Fail-fast rules of the {@code prod} profile configuration guard. Pure unit
 * tests — the guard's validation is exercised directly so no production
 * context or machine environment variables are involved.
 */
class ProductionConfigGuardTest {

    private static final String STRONG_SECRET =
        "a-strong-production-secret-with-plenty-of-entropy-0123456789";
    private static final List<String> EXPLICIT_ORIGINS = List.of("https://potriv.aydgn.me");
    private static final String POSTGRES_URL = "jdbc:postgresql://db.internal:5432/potriv";

    private static void validate(String jwtSecret, List<String> corsOrigins,
        String datasourceUrl, String ddlAuto) {
        ProductionConfigGuard.validate(jwtSecret, corsOrigins, datasourceUrl, ddlAuto,
            false, "", "", false, "", "", false);
    }

    @Test
    void acceptsSafeProductionConfiguration() {
        assertThatCode(() -> validate(STRONG_SECRET, EXPLICIT_ORIGINS, POSTGRES_URL, "validate"))
            .doesNotThrowAnyException();
        assertThatCode(() -> validate(STRONG_SECRET, EXPLICIT_ORIGINS, POSTGRES_URL, "none"))
            .doesNotThrowAnyException();
    }

    @Test
    void rejectsPlaceholderJwtSecret() {
        assertThatThrownBy(() -> validate(
                "change-this-secret-in-production-change-this-secret",
                EXPLICIT_ORIGINS, POSTGRES_URL, "validate"))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("JWT secret");
        assertThatThrownBy(() -> validate(null, EXPLICIT_ORIGINS, POSTGRES_URL, "validate"))
            .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void rejectsWildcardOrMissingCorsOrigins() {
        assertThatThrownBy(() -> validate(
                STRONG_SECRET, List.of("*"), POSTGRES_URL, "validate"))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("CORS");
        assertThatThrownBy(() -> validate(
                STRONG_SECRET, List.of("https://*.aydgn.me"), POSTGRES_URL, "validate"))
            .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> validate(STRONG_SECRET, List.of(), POSTGRES_URL, "validate"))
            .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void rejectsNonPostgresDatasource() {
        assertThatThrownBy(() -> validate(
                STRONG_SECRET, EXPLICIT_ORIGINS, "jdbc:h2:mem:potriv", "validate"))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("PostgreSQL");
        assertThatThrownBy(() -> validate(STRONG_SECRET, EXPLICIT_ORIGINS, null, "validate"))
            .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void rejectsDestructiveHibernateDdlModes() {
        for (String mode : List.of("create", "create-drop", "update")) {
            assertThatThrownBy(() -> validate(STRONG_SECRET, EXPLICIT_ORIGINS,
                    POSTGRES_URL, mode))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Flyway");
        }
    }

    @Test
    void adminConsoleDisabledIsAlwaysAllowed() {
        assertThatCode(() -> ProductionConfigGuard.validate(
                STRONG_SECRET, EXPLICIT_ORIGINS, POSTGRES_URL, "validate",
                false, "", "", false, "", "", false))
            .doesNotThrowAnyException();
    }

    @Test
    void adminConsoleEnabledRequiresSystemAdminEmailAndPassword() {
        assertThatThrownBy(() -> ProductionConfigGuard.validate(
                STRONG_SECRET, EXPLICIT_ORIGINS, POSTGRES_URL, "validate",
                true, "", "a-strong-admin-password", false, "", "", false))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("email");
        assertThatThrownBy(() -> ProductionConfigGuard.validate(
                STRONG_SECRET, EXPLICIT_ORIGINS, POSTGRES_URL, "validate",
                true, "admin@potriv.aydgn.me", "", false, "", "", false))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("password");
    }

    @Test
    void adminConsoleEnabledRejectsPlaceholderOrShortSystemAdminPassword() {
        assertThatThrownBy(() -> ProductionConfigGuard.validate(
                STRONG_SECRET, EXPLICIT_ORIGINS, POSTGRES_URL, "validate",
                true, "admin@potriv.aydgn.me", "ChangeMe123!", false, "", "", false))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("placeholder");
        assertThatThrownBy(() -> ProductionConfigGuard.validate(
                STRONG_SECRET, EXPLICIT_ORIGINS, POSTGRES_URL, "validate",
                true, "admin@potriv.aydgn.me", "replace-me", false, "", "", false))
            .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> ProductionConfigGuard.validate(
                STRONG_SECRET, EXPLICIT_ORIGINS, POSTGRES_URL, "validate",
                true, "admin@potriv.aydgn.me", "short", false, "", "", false))
            .isInstanceOf(IllegalStateException.class);
        assertThatCode(() -> ProductionConfigGuard.validate(
                STRONG_SECRET, EXPLICIT_ORIGINS, POSTGRES_URL, "validate",
                true, "admin@potriv.aydgn.me", "a-strong-admin-password", false, "", "", false))
            .doesNotThrowAnyException();
    }

    @Test
    void rateLimitDisabledIsAlwaysAllowedWhateverTheSecret() {
        assertThatCode(() -> ProductionConfigGuard.validate(
                STRONG_SECRET, EXPLICIT_ORIGINS, POSTGRES_URL, "validate",
                false, "", "", false, "", "", false))
            .doesNotThrowAnyException();
        assertThatCode(() -> ProductionConfigGuard.validate(
                STRONG_SECRET, EXPLICIT_ORIGINS, POSTGRES_URL, "validate",
                false, "", "", false, "change-this-secret-in-production-change-this-secret",
                "", false))
            .doesNotThrowAnyException();
    }

    @Test
    void rateLimitEnabledRejectsMissingOrPlaceholderHmacSecret() {
        assertThatThrownBy(() -> ProductionConfigGuard.validate(
                STRONG_SECRET, EXPLICIT_ORIGINS, POSTGRES_URL, "validate",
                false, "", "", true, "", "", false))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("rate-limit");
        assertThatThrownBy(() -> ProductionConfigGuard.validate(
                STRONG_SECRET, EXPLICIT_ORIGINS, POSTGRES_URL, "validate",
                false, "", "", true,
                "change-this-secret-in-production-change-this-secret", "", false))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("rate-limit");
    }

    @Test
    void rateLimitEnabledAcceptsAStrongSecret() {
        assertThatCode(() -> ProductionConfigGuard.validate(
                STRONG_SECRET, EXPLICIT_ORIGINS, POSTGRES_URL, "validate",
                false, "", "", true, "a-strong-rate-limit-secret-0123456789",
                "10.0.0.0/8", false))
            .doesNotThrowAnyException();
    }

    @Test
    void trustedProxyCheckIsSkippedWhenRateLimitDisabled() {
        assertThatCode(() -> ProductionConfigGuard.validate(
                STRONG_SECRET, EXPLICIT_ORIGINS, POSTGRES_URL, "validate",
                false, "", "", false, "", "", false))
            .doesNotThrowAnyException();
    }

    @Test
    void rateLimitEnabledRejectsEmptyTrustedProxiesWithoutNoReverseProxyOptOut() {
        assertThatThrownBy(() -> ProductionConfigGuard.validate(
                STRONG_SECRET, EXPLICIT_ORIGINS, POSTGRES_URL, "validate",
                false, "", "", true, "a-strong-rate-limit-secret-0123456789",
                "", false))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("RATE_LIMIT_TRUSTED_PROXIES");
        assertThatThrownBy(() -> ProductionConfigGuard.validate(
                STRONG_SECRET, EXPLICIT_ORIGINS, POSTGRES_URL, "validate",
                false, "", "", true, "a-strong-rate-limit-secret-0123456789",
                "   ", false))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("RATE_LIMIT_TRUSTED_PROXIES");
    }

    @Test
    void rateLimitEnabledAcceptsNoReverseProxyOptOutWithEmptyTrustedProxies() {
        assertThatCode(() -> ProductionConfigGuard.validate(
                STRONG_SECRET, EXPLICIT_ORIGINS, POSTGRES_URL, "validate",
                false, "", "", true, "a-strong-rate-limit-secret-0123456789",
                "", true))
            .doesNotThrowAnyException();
    }

    @Test
    void rateLimitEnabledRejectsBothTrustedProxiesAndNoReverseProxyTogether() {
        assertThatThrownBy(() -> ProductionConfigGuard.validate(
                STRONG_SECRET, EXPLICIT_ORIGINS, POSTGRES_URL, "validate",
                false, "", "", true, "a-strong-rate-limit-secret-0123456789",
                "10.0.0.0/8", true))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("contradictory");
    }
}
