package me.aydgn.potriv.identity.service;

import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Base64;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.common.config.AuthProperties;
import me.aydgn.potriv.common.exception.BadRequestException;
import me.aydgn.potriv.common.security.TokenDigest;
import me.aydgn.potriv.identity.dto.PasswordResetConfirmRequest;
import me.aydgn.potriv.identity.dto.PasswordResetRequest;
import me.aydgn.potriv.identity.entity.PasswordResetToken;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.repository.PasswordResetTokenRepository;
import me.aydgn.potriv.identity.repository.UserRepository;

@Service
public class PasswordResetService {

    private static final Logger log = LoggerFactory.getLogger(PasswordResetService.class);

    private static final int TOKEN_BYTE_LENGTH = 32;

    private final UserRepository userRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final PasswordResetMailService passwordResetMailService;
    private final UserSessionService userSessionService;
    private final PasswordEncoder passwordEncoder;
    private final SecureRandom secureRandom = new SecureRandom();
    private final String frontendUrl;
    private final long resetTokenMinutes;

    public PasswordResetService(
        UserRepository userRepository,
        PasswordResetTokenRepository passwordResetTokenRepository,
        PasswordResetMailService passwordResetMailService,
        UserSessionService userSessionService,
        PasswordEncoder passwordEncoder,
        AuthProperties authProperties,
        @Value("${app.frontend-url}") String frontendUrl
    ) {
        this.userRepository = userRepository;
        this.passwordResetTokenRepository = passwordResetTokenRepository;
        this.passwordResetMailService = passwordResetMailService;
        this.userSessionService = userSessionService;
        this.passwordEncoder = passwordEncoder;
        this.frontendUrl = frontendUrl;
        this.resetTokenMinutes = authProperties.passwordResetTokenMinutes();
    }

    @Transactional
    public void requestReset(PasswordResetRequest request) {
        String normalizedEmail = request.email().trim().toLowerCase();

        userRepository.findByEmail(normalizedEmail).ifPresent(this::createAndSendResetToken);
    }

    @Transactional
    public void confirmReset(PasswordResetConfirmRequest request) {
        PasswordResetToken resetToken = passwordResetTokenRepository
            .findByTokenHash(TokenDigest.sha256Base64Url(request.token()))
            .orElseThrow(PasswordResetService::invalidTokenException);

        if (resetToken.isUsed() || resetToken.isExpired()) {
            throw invalidTokenException();
        }

        User user = resetToken.getUser();

        user.changePassword(passwordEncoder.encode(request.newPassword()));
        user.resetLoginFailures();
        resetToken.markUsed();

        userSessionService.revokeAllSessionsForUser(user.getId());
    }

    private void createAndSendResetToken(User user) {
        passwordResetTokenRepository
            .findByUserAndUsedAtIsNull(user)
            .forEach(PasswordResetToken::markUsed);

        byte[] tokenBytes = new byte[TOKEN_BYTE_LENGTH];
        secureRandom.nextBytes(tokenBytes);

        String rawToken = Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);

        OffsetDateTime expiresAt = OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(resetTokenMinutes);

        passwordResetTokenRepository.save(
            new PasswordResetToken(user, TokenDigest.sha256Base64Url(rawToken), expiresAt)
        );

        try {
            passwordResetMailService.sendPasswordResetMail(
                user.getEmail(),
                user.getName(),
                frontendUrl + "/reset-password?token=" + rawToken
            );
        } catch (MailException exception) {
            // Keep the response identical for all callers; the raw token is
            // intentionally absent from this log statement.
            log.warn("Failed to send password reset email.", exception);
        }
    }

    private static BadRequestException invalidTokenException() {
        return new BadRequestException("Password reset token is invalid, expired, or already used.");
    }
}
