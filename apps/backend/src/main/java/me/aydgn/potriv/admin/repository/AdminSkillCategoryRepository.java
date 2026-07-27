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

import me.aydgn.potriv.skill.entity.SkillCategory;

/**
 * Read-only projections for the admin skill-category browser. A dedicated
 * {@code Repository} interface (not the domain {@code SkillCategoryRepository})
 * keeps admin read paths isolated and lets the admin search across organizations.
 */
public interface AdminSkillCategoryRepository extends Repository<SkillCategory, UUID> {

    @Query(value = "select c from SkillCategory c left join fetch c.organization "
        + "where lower(c.name) like :pattern",
        countQuery = "select count(c) from SkillCategory c where lower(c.name) like :pattern")
    Page<SkillCategory> search(@Param("pattern") String pattern, Pageable pageable);

    @Query("select c from SkillCategory c left join fetch c.organization where c.id = :id")
    Optional<SkillCategory> findDetailById(@Param("id") UUID id);

    @Query("select s.category.id, count(s) from Skill s "
        + "where s.category.id in :ids group by s.category.id")
    List<Object[]> countSkillsByCategoryIds(@Param("ids") Collection<UUID> ids);
}
