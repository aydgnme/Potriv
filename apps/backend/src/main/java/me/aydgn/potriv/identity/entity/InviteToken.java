package me.aydgn.potriv.identity.entity;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import me.aydgn.potriv.common.audit.BaseEntity;
import me.aydgn.potriv.organization.entity.Organization;

/**
 * An invitation for one person to register into an organization.
 *
 * Only the SHA-256 of the invite is stored. The raw value exists once, in the
 * response that creates it, and is never persisted, logged or returned again —
 * so a database read cannot mint registrations, which is what the previous
 * plaintext column allowed.
 *
 * Three things end an invite's life and they stay distinct on purpose:
 * {@code expiresAt} is when it lapses on its own, {@code consumedAt} is the one
 * registration it permitted, and {@code active} is an administrator revoking
 * it. Collapsing them would lose why an invite stopped working.
 */
@Entity
@Table(
    name = "invite_tokens",
    indexes = {
        @Index(name = "idx_invite_tokens_token_hash", columnList = "token_hash"),
        @Index(name = "idx_invite_tokens_organization_id", columnList = "organization_id")
    }
)
public class InviteToken extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "organization_id", nullable = false)
    private Organization organization;

    @Column(name = "token_hash", nullable = false, unique = true, length = 64)
    private String tokenHash;

    /**
     * The address this invite was issued to, normalised.
     *
     * Redemption requires the registering address to equal it, which is what
     * makes an invite one person's rather than the organization's: a link that
     * reaches the wrong inbox cannot be used there.
     */
    @Column(name = "invited_email", nullable = false, length = 320)
    private String invitedEmail;

    /** Mandatory. A token that never lapses is a permanent credential. */
    @Column(name = "expires_at", nullable = false)
    private OffsetDateTime expiresAt;

    /** Set by the one registration this invite permits. */
    @Column(name = "consumed_at")
    private OffsetDateTime consumedAt;

    @Column(name = "revoked_at")
    private OffsetDateTime revokedAt;

    @Column(nullable = false)
    private boolean active = true;

    protected InviteToken() {
    }

    public InviteToken(
        Organization organization,
        String tokenHash,
        String invitedEmail,
        OffsetDateTime expiresAt
    ) {
        this.organization = organization;
        this.tokenHash = tokenHash;
        this.invitedEmail = invitedEmail;
        this.expiresAt = expiresAt;
        this.active = true;
    }

    public Organization getOrganization() {
        return organization;
    }

    public String getTokenHash() {
        return tokenHash;
    }

    public String getInvitedEmail() {
        return invitedEmail;
    }

    public OffsetDateTime getExpiresAt() {
        return expiresAt;
    }

    public OffsetDateTime getConsumedAt() {
        return consumedAt;
    }

    public OffsetDateTime getRevokedAt() {
        return revokedAt;
    }

    public boolean isActive() {
        return active;
    }

    public boolean isExpired() {
        return OffsetDateTime.now(ZoneOffset.UTC).isAfter(expiresAt);
    }

    public boolean isConsumed() {
        return consumedAt != null;
    }

    /**
     * The four states an invitation can be in, in the order they are decided.
     *
     * {@code ACCEPTED} is tested first and deliberately: it is the only
     * terminal state that records something a person did, and it must survive
     * everything that happens to the row afterwards. Deciding {@code REVOKED}
     * first — which the admin console's own status function used to do — would
     * relabel somebody's completed registration as an administrative action the
     * moment the spent row was disabled.
     */
    public enum Status {
        PENDING,
        ACCEPTED,
        EXPIRED,
        REVOKED
    }

    public Status status() {
        if (isConsumed()) {
            return Status.ACCEPTED;
        }
        if (!active) {
            return Status.REVOKED;
        }
        if (isExpired()) {
            return Status.EXPIRED;
        }
        return Status.PENDING;
    }

    /**
     * The one definition of "outstanding": not yet used, not withdrawn, not
     * lapsed.
     *
     * Every caller that asks "is there an invitation waiting for this person"
     * — re-inviting, listing, revoking, counting — must ask it here. They used
     * to each spell out their own predicate, and the ones that only checked
     * {@code active} counted spent invitations as outstanding.
     *
     * Read-only. The accept path deliberately does not branch on this: two
     * requests arriving together would both pass a check made here before
     * either had written anything. Redemption is a single conditional UPDATE
     * in the database instead.
     */
    public boolean isPending() {
        return active && !isExpired() && !isConsumed();
    }

    /**
     * Withdraws the invitation.
     *
     * An accepted invitation is left alone. Its {@code active} flag is already
     * false — redemption clears it — and writing {@code revokedAt} onto a row
     * that records a completed registration would turn a person's own action
     * into an administrative one in the audit trail.
     */
    public void deactivate() {
        if (isConsumed()) {
            return;
        }
        this.active = false;
        if (this.revokedAt == null) {
            this.revokedAt = OffsetDateTime.now(ZoneOffset.UTC);
        }
    }
}
