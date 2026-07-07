package me.aydgn.potriv.identity.service;

import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import me.aydgn.potriv.common.security.TokenDigest;
import me.aydgn.potriv.identity.entity.RefreshToken;
import me.aydgn.potriv.identity.entity.UserSession;
import me.aydgn.potriv.identity.repository.RefreshTokenRepository;

@Service
public class RefreshTokenService {

    private static final int TOKEN_BYTE_LENGTH = 64;

    private final RefreshTokenRepository refreshTokenRepository;
    private final SecureRandom secureRandom = new SecureRandom();
    private final long refreshTokenDays;

    public RefreshTokenService(
        RefreshTokenRepository refreshTokenRepository,
        @Value("${app.jwt.refresh-token-days}") long refreshTokenDays
    ) {
        this.refreshTokenRepository = refreshTokenRepository;
        this.refreshTokenDays = refreshTokenDays;
    }

    public record IssuedRefreshToken(String rawToken, RefreshToken token) {
    }

    public IssuedRefreshToken issue(UserSession session) {
        byte[] tokenBytes = new byte[TOKEN_BYTE_LENGTH];
        secureRandom.nextBytes(tokenBytes);

        String rawToken = Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);

        OffsetDateTime expiresAt = OffsetDateTime.now(ZoneOffset.UTC).plusDays(refreshTokenDays);

        RefreshToken token = refreshTokenRepository.save(
            new RefreshToken(session, TokenDigest.sha256Base64Url(rawToken), expiresAt)
        );

        return new IssuedRefreshToken(rawToken, token);
    }

    public Optional<RefreshToken> findByRawToken(String rawToken) {
        return refreshTokenRepository.findByTokenHash(TokenDigest.sha256Base64Url(rawToken));
    }

    public void revokeAllForSession(UserSession session) {
        refreshTokenRepository.findBySessionAndRevokedAtIsNull(session)
            .forEach(RefreshToken::revoke);
    }
}
