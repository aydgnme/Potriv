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
     * A token about to be mailed, and the invitation it belongs to.
     *
     * The raw value is carried out of here in memory and dropped. It is not on
     * the entity, so nothing downstream can log it, audit it or serialise it
     * into an error — the only ways it previously escaped.
     */
    public record IssuedInvite(InviteToken invite, String rawToken) {
    }

    /**
     * Records the intention to invite an address. No token, nothing sent.
     *
     * This is the transaction the caller waits on, and it deliberately does
     * nothing that can fail for an external reason. The token is minted, and
     * the mail sent, by the delivery worker in a later transaction — so a mail
     * server that is unreachable cannot roll back an invitation the
     * administrator has already been told about, and cannot hold a database
     * lock open for the length of an SMTP timeout.
     */
    public InviteToken queueFor(Organization organization, String email) {
        return inviteTokenRepository.save(
            new InviteToken(
                organization,
                normalizeEmail(email),
                OffsetDateTime.now(ZoneOffset.UTC).plusHours(inviteTokenHours))
        );
    }

    /**
     * Mints the token for one delivery attempt.
     *
     * A new value every attempt, deliberately. A retry that reused the previous
     * token would extend the lifetime of a value that may already have reached
     * a mailbox, a bounce message or a mail relay's logs on the failed attempt.
     *
     * The expiry restarts here too: the clock the recipient experiences begins
     * when the link is sent, not when the intention was recorded behind a
     * broken mail server.
     */
    public IssuedInvite mintFor(InviteToken invite) {
        String rawToken = generateToken();
        invite.prepareAttempt(
            TokenDigest.sha256Base64Url(rawToken),
            OffsetDateTime.now(ZoneOffset.UTC).plusHours(inviteTokenHours));
        return new IssuedInvite(invite, rawToken);
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
