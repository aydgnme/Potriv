package me.aydgn.potriv.identity.repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import me.aydgn.potriv.identity.entity.RegistrationVerification;

/**
 * Every write here is the same lease-guarded conditional-UPDATE idiom as
 * {@link InviteTokenRepository} — see that interface's javadoc for the full
 * reasoning. The one addition, {@link #claim}'s requirement that
 * {@code deliveryStatus = SENT}, is exactly {@code InviteTokenRepository
 * #claim}'s: a hash committed while a row is still DELIVERING is not yet
 * redeemable by anyone, because the send it belongs to has not been recorded
 * as having actually happened.
 */
public interface RegistrationVerificationRepository
    extends JpaRepository<RegistrationVerification, UUID> {

    Optional<RegistrationVerification> findByTokenHash(String tokenHash);

    /** See {@code InviteTokenRepository#claimDelivery}. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
        update RegistrationVerification r
           set r.deliveryStatus = me.aydgn.potriv.identity.entity.RegistrationVerification$DeliveryStatus.DELIVERING,
               r.leaseOwner = :attemptId,
               r.nextAttemptAt = :leaseUntil,
               r.attemptCount = r.attemptCount + 1
         where r.id = :id
           and (r.deliveryStatus = me.aydgn.potriv.identity.entity.RegistrationVerification$DeliveryStatus.QUEUED
                or r.deliveryStatus = me.aydgn.potriv.identity.entity.RegistrationVerification$DeliveryStatus.DELIVERING)
           and r.nextAttemptAt <= :now
        """)
    int claimDelivery(@Param("id") UUID id,
                      @Param("now") OffsetDateTime now,
                      @Param("leaseUntil") OffsetDateTime leaseUntil,
                      @Param("attemptId") UUID attemptId);

    /** See {@code InviteTokenRepository#commitAttemptToken}. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
        update RegistrationVerification r
           set r.tokenHash = :tokenHash,
               r.expiresAt = :expiresAt
         where r.id = :id
           and r.leaseOwner = :attemptId
           and r.deliveryStatus = me.aydgn.potriv.identity.entity.RegistrationVerification$DeliveryStatus.DELIVERING
        """)
    int commitAttemptToken(@Param("id") UUID id,
                           @Param("attemptId") UUID attemptId,
                           @Param("tokenHash") String tokenHash,
                           @Param("expiresAt") OffsetDateTime expiresAt);

    /** See {@code InviteTokenRepository#markDelivered}. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
        update RegistrationVerification r
           set r.deliveryStatus = me.aydgn.potriv.identity.entity.RegistrationVerification$DeliveryStatus.SENT,
               r.nextAttemptAt = null,
               r.lastError = null,
               r.leaseOwner = null
         where r.id = :id
           and r.leaseOwner = :attemptId
           and r.deliveryStatus = me.aydgn.potriv.identity.entity.RegistrationVerification$DeliveryStatus.DELIVERING
        """)
    int markDelivered(@Param("id") UUID id, @Param("attemptId") UUID attemptId);

    /**
     * Resolves a claimed row without sending anything, because the worker
     * found — at send time, not before — that the address was already
     * registered. No token is minted for a suppressed row, and no retry
     * follows: {@code nextAttemptAt} is left null, so
     * {@link #findDueDeliveries} never selects it again.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
        update RegistrationVerification r
           set r.deliveryStatus = me.aydgn.potriv.identity.entity.RegistrationVerification$DeliveryStatus.SUPPRESSED,
               r.nextAttemptAt = null,
               r.lastError = null,
               r.leaseOwner = null
         where r.id = :id
           and r.leaseOwner = :attemptId
           and r.deliveryStatus = me.aydgn.potriv.identity.entity.RegistrationVerification$DeliveryStatus.DELIVERING
        """)
    int suppress(@Param("id") UUID id, @Param("attemptId") UUID attemptId);

    /** See {@code InviteTokenRepository#recoverFailedAttempt}. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
        update RegistrationVerification r
           set r.tokenHash = null,
               r.leaseOwner = null,
               r.deliveryStatus = :nextStatus,
               r.nextAttemptAt = :nextAttemptAt,
               r.lastError = :lastError
         where r.id = :id
           and r.leaseOwner = :attemptId
           and r.deliveryStatus = me.aydgn.potriv.identity.entity.RegistrationVerification$DeliveryStatus.DELIVERING
        """)
    int recoverFailedAttempt(@Param("id") UUID id,
                             @Param("attemptId") UUID attemptId,
                             @Param("nextStatus") RegistrationVerification.DeliveryStatus nextStatus,
                             @Param("nextAttemptAt") OffsetDateTime nextAttemptAt,
                             @Param("lastError") String lastError);

    /** See {@code InviteTokenRepository#findDueDeliveries}. */
    @Query("""
        select r from RegistrationVerification r
         where (r.deliveryStatus = me.aydgn.potriv.identity.entity.RegistrationVerification$DeliveryStatus.QUEUED
                or r.deliveryStatus = me.aydgn.potriv.identity.entity.RegistrationVerification$DeliveryStatus.DELIVERING)
           and r.nextAttemptAt <= :now
         order by r.nextAttemptAt asc
        """)
    List<RegistrationVerification> findDueDeliveries(
        @Param("now") OffsetDateTime now, Pageable pageable);

    /**
     * Claims a confirmation, atomically.
     *
     * The whole redemption test lives in the WHERE clause so the database
     * decides who wins, exactly like {@code InviteTokenRepository#claim}: two
     * confirmations racing the same token must not both pass a Java check
     * before either has written anything. {@code deliveryStatus = SENT} rules
     * out a hash that is only committed, not yet mailed — see this
     * interface's own javadoc.
     *
     * Returns the number of rows updated: 1 for the confirmation that claimed
     * it, 0 for every other reason (unknown hash, expired, already used, or
     * not yet SENT). The caller must not proceed on 0.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
        update RegistrationVerification r
           set r.usedAt = CURRENT_TIMESTAMP
         where r.tokenHash = :tokenHash
           and r.usedAt is null
           and r.expiresAt > CURRENT_TIMESTAMP
           and r.deliveryStatus = me.aydgn.potriv.identity.entity.RegistrationVerification$DeliveryStatus.SENT
        """)
    int claim(@Param("tokenHash") String tokenHash);
}
