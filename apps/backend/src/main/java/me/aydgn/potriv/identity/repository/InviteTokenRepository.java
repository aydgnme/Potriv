package me.aydgn.potriv.identity.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import me.aydgn.potriv.identity.entity.InviteToken;
import me.aydgn.potriv.organization.entity.Organization;

public interface InviteTokenRepository extends JpaRepository<InviteToken, UUID> {
    Optional<InviteToken> findByToken(String token);
    Optional<InviteToken> findByOrganizationAndActiveTrue(Organization organization);
    Optional<InviteToken> findFirstByOrganizationAndActiveTrueOrderByCreatedAtDesc(Organization organization);
    List<InviteToken> findAllByOrganizationAndActiveTrue(Organization organization);
}
