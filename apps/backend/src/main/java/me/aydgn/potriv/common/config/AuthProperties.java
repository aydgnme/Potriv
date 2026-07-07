package me.aydgn.potriv.common.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.auth")
public record AuthProperties(
    long passwordResetTokenMinutes,
    int maxFailedLoginAttempts,
    long lockDurationMinutes
) {

    public AuthProperties {
        if (passwordResetTokenMinutes <= 0) {
            throw new IllegalStateException(
                "app.auth.password-reset-token-minutes must be positive."
            );
        }

        if (maxFailedLoginAttempts <= 0) {
            throw new IllegalStateException(
                "app.auth.max-failed-login-attempts must be positive."
            );
        }

        if (lockDurationMinutes <= 0) {
            throw new IllegalStateException(
                "app.auth.lock-duration-minutes must be positive."
            );
        }
    }
}
