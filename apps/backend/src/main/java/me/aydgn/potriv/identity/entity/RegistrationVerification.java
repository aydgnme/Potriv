package me.aydgn.potriv.identity.entity;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import me.aydgn.potriv.common.audit.BaseEntity;
import me.aydgn.potriv.identity.support.EmailAddresses;

/**
 * One organization-admin self-registration, waiting on proof its email
 * address is real.
 *
 * Registration used to create the organization and the admin account inside
 * the request that asked for them, which meant the response had to say
 * whether the address was already taken — an unauthenticated way to test
 * whether somebody has an account. This row is what the request creates
 * instead: an intention, identical in shape whether or not the address turns
 * out to be registrable, so the response never has anything to differ on. The
 * organization and the admin account are created only when this row's token
 * is redeemed, by {@code AuthRegistrationService#confirmRegistration}.
 *
 * Deliberately never holds a plaintext password: {@link #passwordHash} is
 * computed once, at request time, from the same call this application would
 * have made anyway to store the account's password — so an address that
 * turns out to be taken costs the same bcrypt round-trip as one that does
 * not, which is what keeps the request handler's timing identical between
 * the two.
 *
 * Delivery is a worker's job, shaped exactly like {@link InviteToken}'s and
 * for the same reasons: minting a token and sending mail inside the request
 * would tie the response to however long SMTP takes, and a token minted
 * before it is known the send will succeed is a live credential for mail
 * nobody received. See {@code RegistrationVerificationDeliveryWorker}.
 */
@Entity
@Table(
    name = "registration_verifications",
    indexes = {
        @Index(name = "idx_registration_verifications_token_hash", columnList = "token_hash")
    }
)
public class RegistrationVerification extends BaseEntity {

    @Column(nullable = false, length = EmailAddresses.MAX_LENGTH)
    private String email;

    @Column(name = "admin_name", nullable = false, length = 120)
    private String adminName;

    @Column(name = "organization_name", nullable = false, length = 160)
    private String organizationName;

    @Column(name = "headquarter_address", nullable = false, columnDefinition = "TEXT")
    private String headquarterAddress;

    /** Never plaintext. Computed once, at request time; see the class note. */
    @Column(name = "password_hash", nullable = false, length = 255)
    private String passwordHash;

    /**
     * Nullable, and unique only where present — exactly {@link InviteToken}'s
     * reasoning: a queued row has no token yet, so nothing is redeemable
     * before a worker mints one for a specific delivery attempt.
     */
    @Column(name = "token_hash", length = 64)
    private String tokenHash;

    @Column(name = "expires_at", nullable = false)
    private OffsetDateTime expiresAt;

    /** Set once, by the one confirmation this row permits. */
    @Column(name = "used_at")
    private OffsetDateTime usedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "delivery_status", nullable = false, length = 20)
    private DeliveryStatus deliveryStatus = DeliveryStatus.QUEUED;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    @Column(name = "next_attempt_at")
    private OffsetDateTime nextAttemptAt;

    /** See {@link InviteToken#getLeaseOwner()} — the same lease-guard idiom. */
    @Column(name = "lease_owner")
    private UUID leaseOwner;

    /** The last failure, for an operator. Never the token, never the email. */
    @Column(name = "last_error", length = 500)
    private String lastError;

    protected RegistrationVerification() {
    }

    public RegistrationVerification(
        String email,
        String adminName,
        String organizationName,
        String headquarterAddress,
        String passwordHash,
        OffsetDateTime provisionalExpiresAt
    ) {
        this.email = email;
        this.adminName = adminName;
        this.organizationName = organizationName;
        this.headquarterAddress = headquarterAddress;
        this.passwordHash = passwordHash;
        this.expiresAt = provisionalExpiresAt;
        this.deliveryStatus = DeliveryStatus.QUEUED;
        this.attemptCount = 0;
        this.nextAttemptAt = OffsetDateTime.now(ZoneOffset.UTC);
    }

    public String getEmail() {
        return email;
    }

    public String getAdminName() {
        return adminName;
    }

    public String getOrganizationName() {
        return organizationName;
    }

    public String getHeadquarterAddress() {
        return headquarterAddress;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public String getTokenHash() {
        return tokenHash;
    }

    public OffsetDateTime getExpiresAt() {
        return expiresAt;
    }

    public OffsetDateTime getUsedAt() {
        return usedAt;
    }

    public boolean isUsed() {
        return usedAt != null;
    }

    public boolean isExpired() {
        return OffsetDateTime.now(ZoneOffset.UTC).isAfter(expiresAt);
    }

    /**
     * Whether a token exists that somebody could actually redeem. Requires
     * {@code deliveryStatus == SENT}, not merely a non-null hash — see
     * {@link InviteToken#isRedeemable()}, the identical reasoning.
     */
    public boolean isRedeemable() {
        return usedAt == null && !isExpired()
            && tokenHash != null && deliveryStatus == DeliveryStatus.SENT;
    }

    public DeliveryStatus getDeliveryStatus() {
        return deliveryStatus;
    }

    public int getAttemptCount() {
        return attemptCount;
    }

    public OffsetDateTime getNextAttemptAt() {
        return nextAttemptAt;
    }

    public UUID getLeaseOwner() {
        return leaseOwner;
    }

    public String getLastError() {
        return lastError;
    }

    /**
     * QUEUED until a worker claims it, DELIVERING for one attempt, then SENT;
     * or back to QUEUED for another try, or FAILED once attempts are
     * exhausted. See {@link InviteToken.DeliveryStatus} — the state machine
     * and every reason behind it are identical.
     *
     * SUPPRESSED is the one state {@code InviteToken} has no counterpart for:
     * the worker found, at send time, that the address was already
     * registered. Nothing is mailed and nothing more is attempted — the
     * request that created this row already returned the same response it
     * would have for any other address, so there is nothing left for this row
     * to communicate to anyone.
     */
    public enum DeliveryStatus {
        QUEUED,
        DELIVERING,
        SENT,
        FAILED,
        SUPPRESSED
    }
}
