package me.aydgn.potriv.organization.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import me.aydgn.potriv.organization.entity.TeamRole;

public interface TeamRoleRepository extends JpaRepository<TeamRole, UUID> {

    List<TeamRole> findByOrganization_IdOrderByNameAsc(UUID organizationId);

    List<TeamRole> findByOrganization_IdAndActiveTrueOrderByNameAsc(UUID organizationId);

    Optional<TeamRole> findByIdAndOrganization_Id(UUID id, UUID organizationId);

    Optional<TeamRole> findByOrganization_IdAndNormalizedName(UUID organizationId, String normalizedName);
}
