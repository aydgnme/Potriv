package me.aydgn.potriv.admin.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import me.aydgn.potriv.skill.entity.Skill;

/**
 * Read-only projections for the admin skill browser. Cross-organization search
 * with optional organization / category / active filters. Organization,
 * category, and author are fetch-joined (all to-one) to avoid N+1 in listings.
 */
public interface AdminSkillRepository extends Repository<Skill, UUID> {

    @Query(value = "select s from Skill s "
        + "left join fetch s.organization left join fetch s.category left join fetch s.author "
        + "where (:organizationId is null or s.organization.id = :organizationId) "
        + "and (:categoryId is null or s.category.id = :categoryId) "
        + "and (:activeOnly = false or s.active = true) "
        + "and lower(s.name) like :pattern",
        countQuery = "select count(s) from Skill s "
        + "where (:organizationId is null or s.organization.id = :organizationId) "
        + "and (:categoryId is null or s.category.id = :categoryId) "
        + "and (:activeOnly = false or s.active = true) "
        + "and lower(s.name) like :pattern")
    Page<Skill> search(
        @Param("organizationId") UUID organizationId,
        @Param("categoryId") UUID categoryId,
        @Param("activeOnly") boolean activeOnly,
        @Param("pattern") String pattern,
        Pageable pageable);

    @Query("select s from Skill s "
        + "left join fetch s.organization left join fetch s.category left join fetch s.author "
        + "where s.id = :id")
    Optional<Skill> findDetailById(@Param("id") UUID id);

    @Query("select l.skill.id, count(l) from SkillDepartmentLink l "
        + "where l.skill.id in :ids group by l.skill.id")
    List<Object[]> countLinksBySkillIds(@Param("ids") Collection<UUID> ids);
}
