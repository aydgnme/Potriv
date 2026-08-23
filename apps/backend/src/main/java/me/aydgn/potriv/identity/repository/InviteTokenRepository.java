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
     * The lease is the schedule itself: the row's next attempt is pushed
     * forward as part of the same statement that selects it, so a second worker
     * asking for due work will not see it, and a worker that dies mid-attempt
     * leaves a job that simply becomes due again when the lease expires. That
     * needs no SENDING state and no cleanup sweep — both of which can strand a
     * job permanently if the process holding it never comes back.
     *
     * Returns the number of rows claimed: 1 for the winner, 0 for everybody
     * else. The caller must not proceed on 0.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
        update InviteToken i
           set i.nextAttemptAt = :leaseUntil
         where i.id = :id
           and i.deliveryStatus = me.aydgn.potriv.identity.entity.InviteToken$DeliveryStatus.QUEUED
           and i.nextAttemptAt <= :now
        """)
    int claimDelivery(@Param("id") UUID id,
                      @Param("now") OffsetDateTime now,
                      @Param("leaseUntil") OffsetDateTime leaseUntil);

    /** Invitations whose next delivery attempt is due, oldest first. */
    @Query("""
        select i from InviteToken i
         where i.deliveryStatus = me.aydgn.potriv.identity.entity.InviteToken$DeliveryStatus.QUEUED
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
     * Returns the number of rows updated: 1 for the request that claimed it,
     * 0 for every other reason (unknown hash, expired, already consumed,
     * revoked, address mismatch).
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
        """)
    int claim(@Param("tokenHash") String tokenHash,
              @Param("invitedEmail") String invitedEmail);
}
