package me.aydgn.potriv.identity.service;

import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Base64;

import org.springframework.stereotype.Service;

import me.aydgn.potriv.identity.support.EmailAddresses;
import me.aydgn.potriv.common.config.AuthProperties;
import me.aydgn.potriv.common.security.TokenDigest;
import me.aydgn.potriv.identity.entity.InviteToken;
import me.aydgn.potriv.identity.repository.InviteTokenRepository;
import me.aydgn.potriv.organization.entity.Organization;

/**
 * Issues employee invites, one per recipient.
 *
 * The raw value is returned once, to the caller that created the invite, and is
 * never stored. Only its SHA-256 reaches the database, so reading the table
 * yields nothing that can be redeemed — the same shape `RefreshTokenService`
 * and `PasswordResetService` already use.
 */
@Service
public class InviteTokenService {

    /** 32 bytes — 256 bits of CSPRNG output, URL-safe once encoded. */
    private static final int TOKEN_BYTE_LENGTH = 32;

    private final InviteTokenRepository inviteTokenRepository;
    private final SecureRandom secureRandom = new SecureRandom();
    private final long inviteTokenHours;

    public InviteTokenService(
        InviteTokenRepository inviteTokenRepository,
        AuthProperties authProperties
    ) {
        this.inviteTokenRepository = inviteTokenRepository;
        this.inviteTokenHours = authProperties.inviteTokenHours();
    }

    /**
     * A freshly created invite and its raw value, together, once.
     *
     * The raw value is carried out of here in memory and dropped. It is not on
     * the entity, so nothing downstream can log it, audit it or serialise it
     * into an error — the only ways it previously escaped.
     */
    public record IssuedInvite(InviteToken invite, String rawToken) {
    }

    /**
     * Issues an invite for one address.
     *
     * The address is stored normalised and redemption compares against it, so
     * the same normalisation has to happen on both sides — hence one method
     * owning it rather than each caller lowercasing in its own way.
     */
    public IssuedInvite createFor(Organization organization, String email) {
        String rawToken = generateToken();
        OffsetDateTime expiresAt =
            OffsetDateTime.now(ZoneOffset.UTC).plusHours(inviteTokenHours);

        InviteToken saved = inviteTokenRepository.save(
            new InviteToken(
                organization,
                TokenDigest.sha256Base64Url(rawToken),
                normalizeEmail(email),
                expiresAt)
        );

        return new IssuedInvite(saved, rawToken);
    }

    /** The one place an invited address is normalised. */
    public static String normalizeEmail(String email) {
        return EmailAddresses.normalize(email);
    }

    private String generateToken() {
        byte[] bytes = new byte[TOKEN_BYTE_LENGTH];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
