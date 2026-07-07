package me.aydgn.potriv.common.config;

import java.nio.charset.StandardCharsets;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.jwt")
public record JwtProperties(
    String issuer,
    String secret,
    long accessTokenMinutes,
    long refreshTokenDays
) {

    // HS256 requires a key of at least 256 bits.
    private static final int MIN_SECRET_BYTES = 32;

    public JwtProperties {
        if (issuer == null || issuer.isBlank()) {
            throw new IllegalStateException("app.jwt.issuer must be configured.");
        }

        if (secret == null
            || secret.getBytes(StandardCharsets.UTF_8).length < MIN_SECRET_BYTES) {
            throw new IllegalStateException(
                "app.jwt.secret must be configured with at least "
                    + MIN_SECRET_BYTES + " bytes for the HS256 signing algorithm."
            );
        }

        if (accessTokenMinutes <= 0) {
            throw new IllegalStateException("app.jwt.access-token-minutes must be positive.");
        }

        if (refreshTokenDays <= 0) {
            throw new IllegalStateException("app.jwt.refresh-token-days must be positive.");
        }
    }

    @Override
    public String toString() {
        // Never leak the signing secret through logging or actuator output.
        return "JwtProperties{issuer='" + issuer
            + "', accessTokenMinutes=" + accessTokenMinutes
            + ", refreshTokenDays=" + refreshTokenDays + "}";
    }
}
