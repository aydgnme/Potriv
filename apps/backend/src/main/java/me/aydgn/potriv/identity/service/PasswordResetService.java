package me.aydgn.potriv.identity.service;

import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Base64;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.mail.MailException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.identity.support.EmailAddresses;
import me.aydgn.potriv.common.config.AuthProperties;
import me.aydgn.potriv.common.exception.BadRequestException;
import me.aydgn.potriv.common.exception.ErrorCodes;
import me.aydgn.potriv.common.ratelimit.RateLimitService;
import me.aydgn.potriv.common.security.TokenDigest;
import me.aydgn.potriv.identity.dto.PasswordResetConfirmRequest;
import me.aydgn.potriv.identity.dto.PasswordResetRequest;
import me.aydgn.potriv.identity.entity.PasswordResetToken;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.repository.PasswordResetTokenRepository;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.security.entity.SecurityAuditEvent;
import me.aydgn.potriv.security.entity.SecurityAuditEventType;
import me.aydgn.potriv.security.service.SecurityAuditService;

@Service
public class PasswordResetService {

    private static final Logger log = LoggerFactory.getLogger(PasswordResetService.class);

    private static final int TOKEN_BYTE_LENGTH = 32;

    private final UserRepository userRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final PasswordResetMailService passwordResetMailService;
    private final UserSessionService userSessionService;
    private final SecurityAuditService securityAuditService;
    private final PasswordEncoder passwordEncoder;
    private final SecureRandom secureRandom = new SecureRandom();
    private final PasswordResetUrlFactory passwordResetUrlFactory;
    private final RateLimitService rateLimitService;
    private final long resetTokenMinutes;

    public PasswordResetService(
        UserRepository userRepository,
        PasswordResetTokenRepository passwordResetTokenRepository,
        PasswordResetMailService passwordResetMailService,
        UserSessionService userSessionService,
        SecurityAuditService securityAuditService,
        PasswordEncoder passwordEncoder,
        AuthProperties authProperties,
        PasswordResetUrlFactory passwordResetUrlFactory,
        RateLimitService rateLimitService
    ) {
        this.userRepository = userRepository;
        this.passwordResetTokenRepository = passwordResetTokenRepository;
        this.passwordResetMailService = passwordResetMailService;
        this.userSessionService = userSessionService;
        this.securityAuditService = securityAuditService;
        this.passwordEncoder = passwordEncoder;
        this.passwordResetUrlFactory = passwordResetUrlFactory;
        this.rateLimitService = rateLimitService;
        this.resetTokenMinutes = authProperties.passwordResetTokenMinutes();
    }

    @Transactional
    public void requestReset(PasswordResetRequest request, String clientIp) {
        String normalizedEmail = EmailAddresses.normalize(request.email());

        /*
          Checked before the lookup below, and on the same two keys — IP and
          this normalised address — whether or not an account exists for it.
          The lookup that follows already treats both cases identically, on
          purpose: branching the rate limit on account existence would open a
          second way to learn it, on top of the one this method's uniform 202
          already closes.
        */
        rateLimitService.checkPasswordReset(clientIp, normalizedEmail);

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

        securityAuditService.record(
            SecurityAuditEvent.builder(
                    SecurityAuditEventType.PASSWORD_RESET_COMPLETED, true)
                .userId(user.getId())
                .organizationId(
                    user.getOrganization() == null ? null : user.getOrganization().getId()
                )
                .normalizedEmail(user.getEmail())
                .build()
        );
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

        securityAuditService.record(
            SecurityAuditEvent.builder(
                    SecurityAuditEventType.PASSWORD_RESET_REQUESTED, true)
                .userId(user.getId())
                .organizationId(
                    user.getOrganization() == null ? null : user.getOrganization().getId()
                )
                .normalizedEmail(user.getEmail())
                .build()
        );

        try {
            passwordResetMailService.sendPasswordResetMail(
                user.getEmail(),
                user.getName(),
                passwordResetUrlFactory.build(rawToken)
            );
        } catch (MailException exception) {
            // Keep the response identical for all callers; the raw token is
            // intentionally absent from this log statement.
            log.warn("Failed to send password reset email.", exception);
        }
    }

    /**
     * The one answer this endpoint gives for every rejection: unknown token,
     * expired, and already used all produce this — same status, same code,
     * same body. Distinguishing them would hand back an oracle for guessing
     * whether a given token ever existed. {@link ErrorCodes#RESET_TOKEN_INVALID}
     * is what a caller branches on; the message is for a person and is free to
     * be reworded or translated without changing what the frontend does with
     * it — see {@link ErrorCodes} for why that split exists.
     */
    private static BadRequestException invalidTokenException() {
        return new BadRequestException(
            "Password reset token is invalid, expired, or already used.",
            ErrorCodes.RESET_TOKEN_INVALID);
    }
}
