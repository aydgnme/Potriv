package me.aydgn.potriv.support;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.UUID;

import javax.crypto.SecretKey;

import org.springframework.stereotype.Component;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import me.aydgn.potriv.common.config.JwtProperties;

/**
 * Crafts access tokens for negative JWT tests (expired, wrong signature,
 * wrong issuer, wrong token type, malformed claims). Uses the same signing
 * secret and issuer as the running application so only the tested attribute
 * differs from a valid token.
 */
@Component
public class JwtTestTokenFactory {

    private final JwtProperties jwtProperties;
    private final SecretKey secretKey;

    public JwtTestTokenFactory(JwtProperties jwtProperties) {
        this.jwtProperties = jwtProperties;
        this.secretKey = Keys.hmacShaKeyFor(
            jwtProperties.secret().getBytes(StandardCharsets.UTF_8)
        );
    }

    public Builder accessToken(UUID userId, UUID sessionId) {
        return new Builder(userId.toString(), sessionId.toString());
    }

    public Builder builderWithSubject(String subject, String sid) {
        return new Builder(subject, sid);
    }

    public final class Builder {

        private String issuer = jwtProperties.issuer();
        private String subject;
        private String sid;
        private String tokenType = "ACCESS";
        private Instant expiresAt = Instant.now().plusSeconds(900);
        private SecretKey signingKey = secretKey;

        private Builder(String subject, String sid) {
            this.subject = subject;
            this.sid = sid;
        }

        public Builder issuer(String issuer) {
            this.issuer = issuer;
            return this;
        }

        public Builder tokenType(String tokenType) {
            this.tokenType = tokenType;
            return this;
        }

        public Builder expiredAt(Instant expiresAt) {
            this.expiresAt = expiresAt;
            return this;
        }

        public Builder signedWithForeignKey() {
            this.signingKey = Keys.hmacShaKeyFor(
                "an-entirely-different-signing-secret-value-256bit".getBytes(StandardCharsets.UTF_8)
            );
            return this;
        }

        public String build() {
            Instant now = Instant.now();

            return Jwts.builder()
                .issuer(issuer)
                .subject(subject)
                .id(UUID.randomUUID().toString())
                .issuedAt(Date.from(now.minusSeconds(60)))
                .expiration(Date.from(expiresAt))
                .claim("token_type", tokenType)
                .claim("sid", sid)
                .claim("email", "crafted@potriv.test")
                .claim("roles", List.of("EMPLOYEE"))
                .signWith(signingKey)
                .compact();
        }
    }
}
