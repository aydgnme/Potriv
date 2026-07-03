package me.aydgn.potriv.common.security;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.UUID;

import javax.crypto.SecretKey;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.User;


@Service
public class JwtService {
    private final String issuer;
    private final String secret;
    private final long accessTokenMinutes;

    public JwtService(
        @Value("${app.jwt.issuer}") String issuer,
        @Value("${app.jwt.secret}") String secret,
        @Value("${app.jwt.access-token-minutes}") long accessTokenMinutes
    ) {
        this.issuer = issuer;
        this.secret = secret;
        this.accessTokenMinutes = accessTokenMinutes;
    }

    public String createAccessToken(User user, List<AccessRole> roles) {
        Instant now = Instant.now();
        Instant expiresAt = now.plusSeconds(accessTokenMinutes * 60);

        List<String> roleNames = roles.stream()
            .map(AccessRole::name)
            .toList();

        UUID organizationId = user.getOrganization() == null
            ? null
            : user.getOrganization().getId();

        return Jwts.builder()
            .issuer(issuer)
            .subject(user.getId().toString())
            .issuedAt(Date.from(now))
            .expiration(Date.from(expiresAt))
            .claim("email", user.getEmail())
            .claim("organizationId", organizationId == null ? null : organizationId.toString())
            .claim("roles", roleNames)
            .signWith(secretKey())
            .compact();
    }

    public Claims parseAccessToken(String token) {
        try {
            return Jwts.parser()
                .verifyWith(secretKey())
                .requireIssuer(issuer)
                .build()
                .parseSignedClaims(token)
                .getPayload();
        } catch (JwtException exception) {
            throw new JwtException("Invalid or expired access token.");
        }
    }

    public long getAccessTokenExpiresInSeconds() {
        return accessTokenMinutes * 60;
    }

    private SecretKey secretKey() {
        return Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }
}