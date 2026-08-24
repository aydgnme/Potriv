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

import me.aydgn.potriv.identity.entity.InviteToken;
import me.aydgn.potriv.organization.entity.Organization;

public interface InviteTokenRepository extends JpaRepository<InviteToken, UUID> {

    Optional<InviteToken> findByTokenHash(String tokenHash);

    // There is deliberately no single-result "the organization's active invite"
    // finder. An organization now holds one outstanding invitation per invited
    // address, so any query shaped to return exactly one would either throw on
    // a perfectly ordinary organization or silently pick a winner.

    List<InviteToken> findAllByOrganizationAndActiveTrue(Organization organization);

    List<InviteToken> findAllByOrganizationOrderByCreatedAtDesc(Organization organization);

    /**
     * The organization's outstanding invitations for one address.
     *
     * The predicate is {@link InviteToken#isPending()} expressed in JPQL, and
     * it must stay that way. The previous finder tested only {@code active},
     * which meant a spent invitation counted as outstanding — so re-inviting
     * somebody stamped {@code revokedAt} onto the row recording their completed
     * registration.
     */
    @Query("""
        select i from InviteToken i
         where i.organization = :organization
           and i.invitedEmail = :invitedEmail
           and i.active = true
           and i.consumedAt is null
           and i.expiresAt > CURRENT_TIMESTAMP
        """)
    List<InviteToken> findPendingFor(
        @Param("organization") Organization organization,
        @Param("invitedEmail") String invitedEmail);

    /** Every outstanding invitation of an organization, by the same predicate. */
    @Query("""
        select i from InviteToken i
         where i.organization = :organization
           and i.active = true
           and i.consumedAt is null
           and i.expiresAt > CURRENT_TIMESTAMP
        """)
    List<InviteToken> findPendingFor(@Param("organization") Organization organization);

    /**
     * Claims one delivery attempt, atomically.
     *
     * Matches two kinds of row: one still QUEUED and due, and one stuck in
     * DELIVERING because whoever claimed it died before finishing — its lease,
     * the same {@code next_attempt_at} column reused as an expiry while a row
     * is DELIVERING, has passed. Either way the winner moves the row to
     * DELIVERING, stamps a fresh lease owner that invalidates whatever attempt
     * held the job before, pushes the lease forward, and counts the attempt.
     * Reusing one column for "next scheduled try" and "lease expiry" needs no
     * extra state and cannot strand a job if the process holding it never comes
     * back — the next pass simply sees it due again, under new ownership.
     *
     * Returns the number of rows claimed: 1 for the winner, 0 for everybody
     * else. The caller must not proceed on 0.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
        update InviteToken i
           set i.deliveryStatus = me.aydgn.potriv.identity.entity.InviteToken$DeliveryStatus.DELIVERING,
               i.leaseOwner = :attemptId,
               i.nextAttemptAt = :leaseUntil,
               i.attemptCount = i.attemptCount + 1
         where i.id = :id
           and (i.deliveryStatus = me.aydgn.potriv.identity.entity.InviteToken$DeliveryStatus.QUEUED
                or i.deliveryStatus = me.aydgn.potriv.identity.entity.InviteToken$DeliveryStatus.DELIVERING)
           and i.nextAttemptAt <= :now
        """)
    int claimDelivery(@Param("id") UUID id,
                      @Param("now") OffsetDateTime now,
                      @Param("leaseUntil") OffsetDateTime leaseUntil,
                      @Param("attemptId") UUID attemptId);

    /**
     * Commits the token minted for this attempt, while the attempt still owns
     * the lease it claimed with.
     *
     * The row stays DELIVERING: {@link InviteToken#isRedeemable()} and
     * {@link #claim} both require SENT, so a hash that reaches the database
     * here — deliberately before the SMTP call, so the send happens with no
     * transaction and no row lock open — is not usable by anyone until the
     * mail actually goes and a separate transaction says so.
     *
     * Guarded by lease owner, not only by id: if this attempt's lease has
     * already expired and been reclaimed, this updates zero rows rather than
     * overwriting the reclaiming attempt's own in-progress work. The caller
     * must treat 0 as "abandon this attempt, send no mail" — the token just
     * generated matches nothing the database will ever call SENT.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
        update InviteToken i
           set i.tokenHash = :tokenHash,
               i.expiresAt = :expiresAt
         where i.id = :id
           and i.leaseOwner = :attemptId
           and i.deliveryStatus = me.aydgn.potriv.identity.entity.InviteToken$DeliveryStatus.DELIVERING
        """)
    int commitAttemptToken(@Param("id") UUID id,
                           @Param("attemptId") UUID attemptId,
                           @Param("tokenHash") String tokenHash,
                           @Param("expiresAt") OffsetDateTime expiresAt);

    /**
     * Records that the mail actually left — the one write that makes a token
     * redeemable — after the SMTP call has already returned successfully and
     * with no transaction open while it ran.
     *
     * Guarded by lease owner for the same reason {@link #commitAttemptToken}
     * is: an attempt whose lease expired while its SMTP call was in flight may
     * already have been superseded by a reclaiming worker's own attempt, with
     * its own token already mailed or in flight. Updating zero rows here means
     * exactly that — this attempt lost the race after the mail had already
     * gone, which is why at most one attempt's token is ever the one recorded
     * as SENT, whatever else happened to race it.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
        update InviteToken i
           set i.deliveryStatus = me.aydgn.potriv.identity.entity.InviteToken$DeliveryStatus.SENT,
               i.nextAttemptAt = null,
               i.lastError = null,
               i.leaseOwner = null
         where i.id = :id
           and i.leaseOwner = :attemptId
           and i.deliveryStatus = me.aydgn.potriv.identity.entity.InviteToken$DeliveryStatus.DELIVERING
        """)
    int markDelivered(@Param("id") UUID id, @Param("attemptId") UUID attemptId);

    /**
     * Recovers from a failed attempt: the token it minted is discarded, the
     * lease is released, and the row returns to QUEUED with a backoff or, past
     * {@code MAX_ATTEMPTS}, to FAILED — the caller computes which, since only
     * it knows the policy, and passes the result here.
     *
     * {@code active} is untouched except when the outcome is FAILED, which
     * always forces it false, matching {@link InviteToken#markDeliveryFailed}.
     * A retry that is going back to QUEUED must not touch it either way: an
     * administrator can revoke an invitation — {@code active = false} — while
     * a delivery attempt for it is in flight, and a recovering attempt writing
     * {@code active = true} over that would silently un-revoke it.
     *
     * Guarded by lease owner for the same reason every other exit from
     * DELIVERING is: if this attempt's lease already expired and was reclaimed
     * before the failure was even caught, the reclaiming attempt owns the job
     * now and this update must not touch it. Updating zero rows is the correct
     * outcome in that case, not an error — there is nothing left here for this
     * attempt to recover.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
        update InviteToken i
           set i.tokenHash = null,
               i.leaseOwner = null,
               i.deliveryStatus = :nextStatus,
               i.nextAttemptAt = :nextAttemptAt,
               i.active = case
                   when :nextStatus = me.aydgn.potriv.identity.entity.InviteToken$DeliveryStatus.FAILED
                       then false
                   else i.active
               end,
               i.lastError = :lastError
         where i.id = :id
           and i.leaseOwner = :attemptId
           and i.deliveryStatus = me.aydgn.potriv.identity.entity.InviteToken$DeliveryStatus.DELIVERING
        """)
    int recoverFailedAttempt(@Param("id") UUID id,
                             @Param("attemptId") UUID attemptId,
                             @Param("nextStatus") InviteToken.DeliveryStatus nextStatus,
                             @Param("nextAttemptAt") OffsetDateTime nextAttemptAt,
                             @Param("lastError") String lastError);

    /**
     * Invitations whose next delivery attempt is due, oldest first.
     *
     * Covers the same two kinds of row {@link #claimDelivery} claims: QUEUED
     * and due, or DELIVERING with an expired lease.
     */
    @Query("""
        select i from InviteToken i
         where (i.deliveryStatus = me.aydgn.potriv.identity.entity.InviteToken$DeliveryStatus.QUEUED
                or i.deliveryStatus = me.aydgn.potriv.identity.entity.InviteToken$DeliveryStatus.DELIVERING)
           and i.nextAttemptAt <= :now
         order by i.nextAttemptAt asc
        """)
    List<InviteToken> findDueDeliveries(@Param("now") OffsetDateTime now, Pageable pageable);

    /**
     * Claims an invite, atomically.
     *
     * The whole redemption test lives in the WHERE clause, so the database
     * decides who wins. Reading the row, checking it in Java and then writing
     * would let two requests that arrive together both pass the check before
     * either had written anything — and both would register.
     *
     * The invited address is part of the same predicate. Comparing it in Java
     * after the lookup would answer a different question for "wrong token" and
     * "right token, wrong person" — the caller must not be able to tell those
     * apart, and here it cannot, because both simply update no rows.
     *
     * {@code deliveryStatus = SENT} is part of the predicate for a reason that
     * is easy to miss: a DELIVERING row can have a non-null {@code tokenHash}
     * too — it is committed there deliberately, before the mail is sent, so the
     * commit and the send are separate transactions. Without this clause, a
     * caller who somehow obtained that value before the mail went out — a
     * narrow window, but a real one — could register against mail nobody had
     * received yet. Requiring SENT closes it: nothing is redeemable before a
     * separate, later transaction has recorded that the send actually
     * succeeded.
     *
     * Returns the number of rows updated: 1 for the request that claimed it,
     * 0 for every other reason (unknown hash, expired, already consumed,
     * revoked, address mismatch, or not yet SENT).
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
        update InviteToken i
           set i.consumedAt = CURRENT_TIMESTAMP,
               i.active = false
         where i.tokenHash = :tokenHash
           and i.invitedEmail = :invitedEmail
           and i.active = true
           and i.consumedAt is null
           and i.expiresAt > CURRENT_TIMESTAMP
           and i.deliveryStatus = me.aydgn.potriv.identity.entity.InviteToken$DeliveryStatus.SENT
        """)
    int claim(@Param("tokenHash") String tokenHash,
              @Param("invitedEmail") String invitedEmail);
}
