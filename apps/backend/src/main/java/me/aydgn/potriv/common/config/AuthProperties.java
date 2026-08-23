package me.aydgn.potriv.common.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.auth")
public record AuthProperties(
    long passwordResetTokenMinutes,
    int maxFailedLoginAttempts,
    long lockDurationMinutes,
    /**
     * How long an employee invite stays redeemable. Configurable because
     * onboarding windows differ; 72 hours by default, which is long enough to
     * reach someone across a weekend and short enough that a link found later
     * in a mailbox or a proxy log is already dead.
     */
    long inviteTokenHours
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
        if (inviteTokenHours <= 0) {
            throw new IllegalStateException(
                "app.auth.invite-token-hours must be positive: an invite that "
                    + "never lapses is a permanent credential."
            );
        }
    }
}
