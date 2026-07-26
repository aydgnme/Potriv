package me.aydgn.potriv.ops.monitor;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Embedded administration console configuration. Disabled by default; when
 * enabled, the console is protected by a SYSTEM_ADMIN browser-session login
 * (see {@code AdminSecurityConfig}). The prod profile additionally requires a
 * real {@code SYSTEM_ADMIN_PASSWORD} via {@code ProductionConfigGuard}.
 */
@ConfigurationProperties(prefix = "potriv.backend-console")
public record BackendMonitorProperties(
    boolean enabled
) {
}
