package me.aydgn.potriv.skill.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import me.aydgn.potriv.skill.entity.Skill;

public interface SkillRepository extends JpaRepository<Skill, UUID> {

    Optional<Skill> findByIdAndOrganization_Id(UUID id, UUID organizationId);

    Optional<Skill> findByOrganization_IdAndCategory_IdAndNormalizedName(
        UUID organizationId, UUID categoryId, String normalizedName);

    // Tenant-scoped search with optional active filter, category filter and a
    // case-insensitive name "contains" query. Category and author are fetch-joined
    // to avoid N+1 when building responses.
    @Query("select s from Skill s "
        + "join fetch s.category c "
        + "join fetch s.author a "
        + "where s.organization.id = :organizationId "
        + "and (:includeInactive = true or s.active = true) "
        + "and (:categoryId is null or c.id = :categoryId) "
        + "and (:q is null or lower(s.name) like lower(concat('%', :q, '%'))) "
        + "order by c.name asc, s.name asc")
    List<Skill> search(
        @Param("organizationId") UUID organizationId,
        @Param("includeInactive") boolean includeInactive,
        @Param("categoryId") UUID categoryId,
        @Param("q") String q);
}
