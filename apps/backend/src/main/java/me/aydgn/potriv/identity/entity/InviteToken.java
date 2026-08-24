package me.aydgn.potriv.identity.entity;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import jakarta.persistence.Enumerated;
import jakarta.persistence.EnumType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import me.aydgn.potriv.identity.support.EmailAddresses;
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

    /*
      Nullable, and unique only where present.

      A queued invitation has no token: the worker mints one when it claims the
      delivery, so a token exists only from the moment it is about to be mailed,
      and an attempt that fails leaves nothing redeemable behind. Uniqueness is
      a partial index in the migration rather than a column constraint here,
      because "unique among the rows that have one" is what is actually meant.
    */
    @Column(name = "token_hash", length = 64)
    private String tokenHash;

    /**
     * The address this invite was issued to, normalised.
     *
     * Redemption requires the registering address to equal it, which is what
     * makes an invite one person's rather than the organization's: a link that
     * reaches the wrong inbox cannot be used there.
     */
    @Column(name = "invited_email", nullable = false, length = EmailAddresses.MAX_LENGTH)
    private String invitedEmail;

    /** Mandatory. A token that never lapses is a permanent credential. */
    @Column(name = "expires_at", nullable = false)
    private OffsetDateTime expiresAt;

    /** Set by the one registration this invite permits. */
    @Column(name = "consumed_at")
    private OffsetDateTime consumedAt;

    /**
     * Where this invitation is in delivery.
     *
     * The row is its own outbox record. Creating the intent and sending the
     * mail are separate transactions, so an unreachable mail server cannot roll
     * back an invitation the administrator was told about, and an invitation
     * that was committed cannot be silently lost when the send fails.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "delivery_status", nullable = false, length = 20)
    private DeliveryStatus deliveryStatus = DeliveryStatus.QUEUED;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    @Column(name = "next_attempt_at")
    private OffsetDateTime nextAttemptAt;

    /**
     * Who owns the in-flight attempt, while there is one.
     *
     * Generated fresh by the worker for every claim and cleared on every exit
     * from {@link DeliveryStatus#DELIVERING}. Its only job is to appear in the
     * {@code WHERE} clause of every write a worker makes while it believes it
     * holds this job, so that a worker whose lease has already expired — and
     * been reclaimed by somebody else — updates zero rows instead of
     * overwriting a claim it no longer holds. See
     * {@code InviteTokenRepository#claimDelivery}.
     */
    @Column(name = "lease_owner")
    private UUID leaseOwner;

    /** The last failure, for an operator. Never the token, never the link. */
    @Column(name = "last_error", length = 500)
    private String lastError;

    @Column(name = "revoked_at")
    private OffsetDateTime revokedAt;

    @Column(nullable = false)
    private boolean active = true;

    protected InviteToken() {
    }

    /**
     * A queued invitation: an intention to invite this address, with no token
     * yet and nothing sent.
     *
     * The expiry is provisional and is set again when a token is actually
     * minted, so the clock starts when the person receives the link rather than
     * when the administrator pressed a button behind a broken mail server.
     */
    public InviteToken(
        Organization organization,
        String invitedEmail,
        OffsetDateTime expiresAt
    ) {
        this.organization = organization;
        this.invitedEmail = invitedEmail;
        this.expiresAt = expiresAt;
        this.active = true;
        this.deliveryStatus = DeliveryStatus.QUEUED;
        this.attemptCount = 0;
        this.nextAttemptAt = OffsetDateTime.now(ZoneOffset.UTC);
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

    /**
     * QUEUED until a worker claims it, DELIVERING for the length of one
     * attempt, then SENT, or back to QUEUED — or FAILED once attempts are
     * exhausted.
     *
     * DELIVERING exists because an attempt has three separate transactions —
     * claim, commit the hash, record the send — and none of them may be
     * allowed to roll back another. A row sits in DELIVERING for the whole of
     * that: from the moment a worker claims it until the moment it is either
     * marked SENT or handed back to QUEUED/FAILED by the recovery transaction.
     * A hash committed while a row is DELIVERING exists in the database and is
     * still not redeemable — {@link #isRedeemable()} and the claim query in
     * {@code InviteTokenRepository} both require SENT — which is what keeps a
     * token that has been minted but not yet mailed from being usable if the
     * send that follows never happens.
     *
     * A claimed job is not due again until its lease — {@code next_attempt_at},
     * reused as an expiry while a row is DELIVERING — elapses. That needs no
     * separate cleanup sweep and cannot strand a job if the worker holding it
     * dies mid-attempt: the same claim query that picks up QUEUED work also
     * reclaims DELIVERING work whose lease has passed, and
     * {@link #leaseOwner} is what stops that reclaiming worker's predecessor
     * from writing SENT after losing the race.
     */
    public enum DeliveryStatus {
        QUEUED,
        DELIVERING,
        SENT,
        FAILED
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
     * Whether a token exists that somebody could actually redeem.
     *
     * Requires {@code deliveryStatus == SENT}, not merely a non-null hash. A
     * hash is committed to the database the moment a worker mints it — before
     * the SMTP call — so that the commit and the send are separate
     * transactions and neither can roll back the other. For the whole of that
     * window the row is DELIVERING and this must say false, or a token nobody
     * has received yet would already be usable. A queued invitation is
     * outstanding but not yet redeemable for the same reason one step earlier:
     * nothing has been minted or mailed at all.
     */
    public boolean isRedeemable() {
        return isPending() && tokenHash != null && deliveryStatus == DeliveryStatus.SENT;
    }

    // ---- delivery ----

    public DeliveryStatus getDeliveryStatus() {
        return deliveryStatus;
    }

    public int getAttemptCount() {
        return attemptCount;
    }

    public OffsetDateTime getNextAttemptAt() {
        return nextAttemptAt;
    }

    public String getLastError() {
        return lastError;
    }

    public UUID getLeaseOwner() {
        return leaseOwner;
    }

    /**
     * Records the token about to be mailed, and moves the row to DELIVERING.
     *
     * The worker itself does not call this: it performs the same transition as
     * a guarded conditional UPDATE (claim, then commit-hash), so that a worker
     * whose lease has already expired updates zero rows instead of overwriting
     * a claim it no longer holds. This entity-level version exists for direct
     * seeding — tests that need an invitation already mid-delivery without
     * going through the worker's transactions.
     */
    public void prepareAttempt(String tokenHash, OffsetDateTime expiresAt) {
        this.tokenHash = tokenHash;
        this.expiresAt = expiresAt;
        this.attemptCount = this.attemptCount + 1;
        this.deliveryStatus = DeliveryStatus.DELIVERING;
    }

    public void markSent() {
        this.deliveryStatus = DeliveryStatus.SENT;
        this.nextAttemptAt = null;
        this.lastError = null;
        this.leaseOwner = null;
    }

    /**
     * The attempt failed: the token it minted is discarded so nothing
     * redeemable is left behind, the row returns to QUEUED, and the job is due
     * again after the backoff.
     */
    public void markAttemptFailed(String reason, OffsetDateTime retryAt) {
        this.tokenHash = null;
        this.deliveryStatus = DeliveryStatus.QUEUED;
        this.nextAttemptAt = retryAt;
        this.lastError = truncate(reason);
        this.leaseOwner = null;
    }

    /** Attempts exhausted. The invitation is dead and never redeemable. */
    public void markDeliveryFailed(String reason) {
        this.tokenHash = null;
        this.deliveryStatus = DeliveryStatus.FAILED;
        this.nextAttemptAt = null;
        this.lastError = truncate(reason);
        this.active = false;
        this.leaseOwner = null;
    }

    private static String truncate(String reason) {
        if (reason == null) {
            return null;
        }
        return reason.length() <= 500 ? reason : reason.substring(0, 500);
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
