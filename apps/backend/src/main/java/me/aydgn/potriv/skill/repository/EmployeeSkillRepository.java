package me.aydgn.potriv.skill.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import me.aydgn.potriv.skill.entity.EmployeeSkill;

public interface EmployeeSkillRepository extends JpaRepository<EmployeeSkill, UUID> {

    Optional<EmployeeSkill> findByIdAndUser_Id(UUID id, UUID userId);

    boolean existsByUser_IdAndSkill_Id(UUID userId, UUID skillId);

    // Own assignments, with skill and category fetch-joined and ordered by
    // category name then skill name, to avoid N+1.
    @Query("select es from EmployeeSkill es "
        + "join fetch es.skill s "
        + "join fetch s.category c "
        + "where es.user.id = :userId "
        + "order by c.name asc, s.name asc")
    List<EmployeeSkill> findOwnedWithSkill(@Param("userId") UUID userId);
}
