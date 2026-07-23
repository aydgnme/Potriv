package me.aydgn.potriv.ops.monitor;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * Pure unit tests for the sanitization helpers of the monitor service.
 */
class BackendMonitorServiceTest {

    @Test
    void sanitizedJdbcUrlDropsQueryParameters() {
        assertThat(BackendMonitorService.sanitizeJdbcUrl(
            "jdbc:postgresql://db:5432/potriv?user=potriv&password=secret"))
            .isEqualTo("jdbc:postgresql://db:5432/potriv");
    }

    @Test
    void sanitizedJdbcUrlDropsInlineCredentials() {
        assertThat(BackendMonitorService.sanitizeJdbcUrl(
            "jdbc:postgresql://potriv:secret@db:5432/potriv"))
            .isEqualTo("jdbc:postgresql://db:5432/potriv");
    }

    @Test
    void sanitizedJdbcUrlHandlesMissingValues() {
        assertThat(BackendMonitorService.sanitizeJdbcUrl(null)).isEqualTo("unknown");
        assertThat(BackendMonitorService.sanitizeJdbcUrl(" ")).isEqualTo("unknown");
        assertThat(BackendMonitorService.sanitizeJdbcUrl("jdbc:postgresql://db:5432/potriv"))
            .isEqualTo("jdbc:postgresql://db:5432/potriv");
    }
}
