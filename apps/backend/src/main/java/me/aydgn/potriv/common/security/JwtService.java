package me.aydgn.potriv.common.security;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.UUID;

import javax.crypto.SecretKey;

import org.springframework.stereotype.Service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import me.aydgn.potriv.common.config.JwtProperties;
import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.User;


@Service
public class JwtService {

    private static final String TOKEN_TYPE_CLAIM = "token_type";
    private static final String ACCESS_TOKEN_TYPE = "ACCESS";

    private final JwtProperties jwtProperties;
    private final SecretKey secretKey;

    public JwtService(JwtProperties jwtProperties) {
        this.jwtProperties = jwtProperties;
        this.secretKey = Keys.hmacShaKeyFor(
            jwtProperties.secret().getBytes(StandardCharsets.UTF_8)
        );
    }

    public String createAccessToken(User user, List<AccessRole> roles, UUID sessionId) {
        Instant now = Instant.now();
        Instant expiresAt = now.plusSeconds(jwtProperties.accessTokenMinutes() * 60);

        List<String> roleNames = roles.stream()
            .map(AccessRole::name)
            .toList();

        UUID organizationId = user.getOrganization() == null
            ? null
            : user.getOrganization().getId();

        return Jwts.builder()
            .issuer(jwtProperties.issuer())
            .subject(user.getId().toString())
            .id(UUID.randomUUID().toString())
            .issuedAt(Date.from(now))
            .expiration(Date.from(expiresAt))
            .claim(TOKEN_TYPE_CLAIM, ACCESS_TOKEN_TYPE)
            .claim("sid", sessionId.toString())
            .claim("email", user.getEmail())
            .claim("organizationId", organizationId == null ? null : organizationId.toString())
            .claim("roles", roleNames)
            .signWith(secretKey)
            .compact();
    }

    public Claims parseAccessToken(String token) {
        Claims claims;

        try {
            claims = Jwts.parser()
                .verifyWith(secretKey)
                .requireIssuer(jwtProperties.issuer())
                .build()
                .parseSignedClaims(token)
                .getPayload();
        } catch (JwtException exception) {
            throw new JwtException("Invalid or expired access token.");
        }

        if (!ACCESS_TOKEN_TYPE.equals(claims.get(TOKEN_TYPE_CLAIM, String.class))) {
            throw new JwtException("Invalid or expired access token.");
        }

        return claims;
    }

    public long getAccessTokenExpiresInSeconds() {
        return jwtProperties.accessTokenMinutes() * 60;
    }
}
