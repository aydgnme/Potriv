package me.aydgn.potriv.identity.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

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
