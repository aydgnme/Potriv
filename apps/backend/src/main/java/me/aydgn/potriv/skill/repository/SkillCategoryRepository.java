package me.aydgn.potriv.skill.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import me.aydgn.potriv.skill.entity.SkillCategory;

public interface SkillCategoryRepository extends JpaRepository<SkillCategory, UUID> {

    List<SkillCategory> findByOrganization_IdOrderByNameAsc(UUID organizationId);

    List<SkillCategory> findByOrganization_IdAndActiveTrueOrderByNameAsc(UUID organizationId);

    Optional<SkillCategory> findByIdAndOrganization_Id(UUID id, UUID organizationId);

    Optional<SkillCategory> findByOrganization_IdAndNormalizedName(
        UUID organizationId, String normalizedName);
}
