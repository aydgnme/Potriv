package me.aydgn.potriv.skill.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import me.aydgn.potriv.skill.entity.SkillDepartmentLink;

public interface SkillDepartmentLinkRepository extends JpaRepository<SkillDepartmentLink, UUID> {

    Optional<SkillDepartmentLink> findBySkill_IdAndDepartment_Id(UUID skillId, UUID departmentId);

    boolean existsByDepartment_Id(UUID departmentId);

    @Query("select l from SkillDepartmentLink l "
        + "join fetch l.department "
        + "where l.skill.id = :skillId "
        + "order by l.department.name asc")
    List<SkillDepartmentLink> findBySkillIdWithDepartment(@Param("skillId") UUID skillId);

    // Grouped link loading for a set of skills, to avoid N+1 in listings.
    @Query("select l from SkillDepartmentLink l "
        + "join fetch l.department "
        + "where l.skill.id in :skillIds "
        + "order by l.department.name asc")
    List<SkillDepartmentLink> findBySkillIdsWithDepartment(
        @Param("skillIds") Collection<UUID> skillIds);
}
