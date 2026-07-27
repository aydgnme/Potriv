package me.aydgn.potriv.skill.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import me.aydgn.potriv.skill.entity.SkillCategory;

public interface SkillCategoryRepository extends JpaRepository<SkillCategory, UUID> {

    List<SkillCategory> findByOrganization_IdOrderByNameAsc(UUID organizationId);

    // Active categories across every organization (org fetched) for the admin
    // skill create form's category picker, grouped by organization.
    @Query("select c from SkillCategory c join fetch c.organization "
        + "where c.active = true order by c.organization.name asc, c.name asc")
    List<SkillCategory> findActiveWithOrganization();

    List<SkillCategory> findByOrganization_IdAndActiveTrueOrderByNameAsc(UUID organizationId);

    Optional<SkillCategory> findByIdAndOrganization_Id(UUID id, UUID organizationId);

    Optional<SkillCategory> findByOrganization_IdAndNormalizedName(
        UUID organizationId, String normalizedName);
}
