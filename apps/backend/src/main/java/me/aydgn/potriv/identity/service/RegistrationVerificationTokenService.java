package me.aydgn.potriv.identity.service;

import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Base64;

import org.springframework.stereotype.Service;

import me.aydgn.potriv.common.config.AuthProperties;
import me.aydgn.potriv.common.security.TokenDigest;

/**
 * Mints registration-verification tokens. Shaped like
 * {@link InviteTokenService} and for the same reason: the raw value must
 * exist only in memory, for the length of one delivery attempt, and never
 * reach a database column, a log, or a response.
 */
@Service
public class RegistrationVerificationTokenService {

    /** 32 bytes — 256 bits of CSPRNG output, URL-safe once encoded. */
    private static final int TOKEN_BYTE_LENGTH = 32;

    private final SecureRandom secureRandom = new SecureRandom();
    private final long verificationMinutes;

    public RegistrationVerificationTokenService(AuthProperties authProperties) {
        this.verificationMinutes = authProperties.registrationVerificationMinutes();
    }

    public record IssuedVerification(String tokenHash, OffsetDateTime expiresAt, String rawToken) {
    }

    /** How long a freshly created row's provisional expiry should read. */
    public OffsetDateTime provisionalExpiry() {
        return OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(verificationMinutes);
    }

    /**
     * Mints the token for one delivery attempt. Pure — nothing is written or
     * persisted here. A new value every attempt: a retry that reused the
     * previous token would extend the lifetime of a value that may already
     * have reached a mailbox, a bounce message, or a mail relay's logs on the
     * failed attempt.
     */
    public IssuedVerification mintFor() {
        String rawToken = generateToken();
        return new IssuedVerification(
            TokenDigest.sha256Base64Url(rawToken),
            OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(verificationMinutes),
            rawToken);
    }

    private String generateToken() {
        byte[] bytes = new byte[TOKEN_BYTE_LENGTH];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
