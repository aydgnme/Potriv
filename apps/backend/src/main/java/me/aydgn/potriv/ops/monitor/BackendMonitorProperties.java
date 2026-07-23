package me.aydgn.potriv.ops.monitor;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Embedded backend monitor console configuration. Disabled by default; when
 * enabled, explicit HTTP Basic credentials are mandatory (enforced by
 * {@link BackendMonitorSecurityConfig} and, for the prod profile, by
 * {@code ProductionConfigGuard}).
 */
@ConfigurationProperties(prefix = "potriv.backend-console")
public record BackendMonitorProperties(
    boolean enabled,
    String username,
    String password
) {

    public boolean hasCredentials() {
        return username != null && !username.isBlank()
            && password != null && !password.isBlank();
    }

    @Override
    public String toString() {
        // Never leak the console password through logging or actuator output.
        return "BackendMonitorProperties{enabled=" + enabled
            + ", username=" + (username == null || username.isBlank() ? "(unset)" : "(set)")
            + ", password=" + (password == null || password.isBlank() ? "(unset)" : "(set)")
            + "}";
    }
}
