package me.aydgn.potriv.admin.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import me.aydgn.potriv.identity.entity.InviteToken;

public interface AdminInvitationRepository extends Repository<InviteToken, UUID> {

    @Query(value = "select i from InviteToken i left join fetch i.organization "
        + "where lower(i.organization.name) like :pattern",
        countQuery = "select count(i) from InviteToken i "
            + "where lower(i.organization.name) like :pattern")
    Page<InviteToken> search(@Param("pattern") String pattern, Pageable pageable);

    @Query("select i from InviteToken i left join fetch i.organization where i.id = :id")
    Optional<InviteToken> findDetailById(@Param("id") UUID id);
}
