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

    @Test
    void acceptsSafeProductionConfiguration() {
        assertThatCode(() -> ProductionConfigGuard.validate(
                STRONG_SECRET, EXPLICIT_ORIGINS, POSTGRES_URL, "validate"))
            .doesNotThrowAnyException();
        assertThatCode(() -> ProductionConfigGuard.validate(
                STRONG_SECRET, EXPLICIT_ORIGINS, POSTGRES_URL, "none"))
            .doesNotThrowAnyException();
    }

    @Test
    void rejectsPlaceholderJwtSecret() {
        assertThatThrownBy(() -> ProductionConfigGuard.validate(
                "change-this-secret-in-production-change-this-secret",
                EXPLICIT_ORIGINS, POSTGRES_URL, "validate"))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("JWT secret");
        assertThatThrownBy(() -> ProductionConfigGuard.validate(
                null, EXPLICIT_ORIGINS, POSTGRES_URL, "validate"))
            .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void rejectsWildcardOrMissingCorsOrigins() {
        assertThatThrownBy(() -> ProductionConfigGuard.validate(
                STRONG_SECRET, List.of("*"), POSTGRES_URL, "validate"))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("CORS");
        assertThatThrownBy(() -> ProductionConfigGuard.validate(
                STRONG_SECRET, List.of("https://*.aydgn.me"), POSTGRES_URL, "validate"))
            .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> ProductionConfigGuard.validate(
                STRONG_SECRET, List.of(), POSTGRES_URL, "validate"))
            .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void rejectsNonPostgresDatasource() {
        assertThatThrownBy(() -> ProductionConfigGuard.validate(
                STRONG_SECRET, EXPLICIT_ORIGINS, "jdbc:h2:mem:potriv", "validate"))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("PostgreSQL");
        assertThatThrownBy(() -> ProductionConfigGuard.validate(
                STRONG_SECRET, EXPLICIT_ORIGINS, null, "validate"))
            .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void rejectsDestructiveHibernateDdlModes() {
        for (String mode : List.of("create", "create-drop", "update")) {
            assertThatThrownBy(() -> ProductionConfigGuard.validate(
                    STRONG_SECRET, EXPLICIT_ORIGINS, POSTGRES_URL, mode))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Flyway");
        }
    }
}
