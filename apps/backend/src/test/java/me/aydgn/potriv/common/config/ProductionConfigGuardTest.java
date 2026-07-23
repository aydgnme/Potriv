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
            false, "", "");
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
    void backendConsoleDisabledIsAlwaysAllowed() {
        assertThatCode(() -> ProductionConfigGuard.validate(
                STRONG_SECRET, EXPLICIT_ORIGINS, POSTGRES_URL, "validate",
                false, "", ""))
            .doesNotThrowAnyException();
    }

    @Test
    void backendConsoleEnabledRequiresExplicitCredentials() {
        assertThatThrownBy(() -> ProductionConfigGuard.validate(
                STRONG_SECRET, EXPLICIT_ORIGINS, POSTGRES_URL, "validate",
                true, "", ""))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("credentials");
        assertThatThrownBy(() -> ProductionConfigGuard.validate(
                STRONG_SECRET, EXPLICIT_ORIGINS, POSTGRES_URL, "validate",
                true, "admin", ""))
            .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> ProductionConfigGuard.validate(
                STRONG_SECRET, EXPLICIT_ORIGINS, POSTGRES_URL, "validate",
                true, "", "a-strong-console-password"))
            .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void backendConsoleEnabledRejectsPlaceholderOrShortPassword() {
        assertThatThrownBy(() -> ProductionConfigGuard.validate(
                STRONG_SECRET, EXPLICIT_ORIGINS, POSTGRES_URL, "validate",
                true, "admin", "replace-me-with-strong-password"))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("placeholder");
        assertThatThrownBy(() -> ProductionConfigGuard.validate(
                STRONG_SECRET, EXPLICIT_ORIGINS, POSTGRES_URL, "validate",
                true, "admin", "short"))
            .isInstanceOf(IllegalStateException.class);
        assertThatCode(() -> ProductionConfigGuard.validate(
                STRONG_SECRET, EXPLICIT_ORIGINS, POSTGRES_URL, "validate",
                true, "admin", "a-strong-console-password"))
            .doesNotThrowAnyException();
    }
}
