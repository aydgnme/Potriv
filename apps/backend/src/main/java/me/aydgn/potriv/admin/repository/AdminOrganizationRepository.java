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

import me.aydgn.potriv.organization.entity.Organization;

/**
 * Read-only, paged admin queries over organizations plus grouped satellite
 * counts (users / departments / projects) so a listing needs one query per
 * count concern, never one per row.
 */
public interface AdminOrganizationRepository extends Repository<Organization, UUID> {

    @Query(value = "select o from Organization o where lower(o.name) like :pattern",
        countQuery = "select count(o) from Organization o where lower(o.name) like :pattern")
    Page<Organization> search(@Param("pattern") String pattern, Pageable pageable);

    Optional<Organization> findById(UUID id);

    @Query("select u.organization.id, count(u) from User u "
        + "where u.organization.id in :ids group by u.organization.id")
    List<Object[]> countUsersByOrganizationIds(@Param("ids") Collection<UUID> ids);

    @Query("select d.organization.id, count(d) from Department d "
        + "where d.organization.id in :ids group by d.organization.id")
    List<Object[]> countDepartmentsByOrganizationIds(@Param("ids") Collection<UUID> ids);

    @Query("select p.organization.id, count(p) from Project p "
        + "where p.organization.id in :ids group by p.organization.id")
    List<Object[]> countProjectsByOrganizationIds(@Param("ids") Collection<UUID> ids);

    @Query("select d.id, d.name from Department d "
        + "where d.organization.id = :organizationId order by d.name asc")
    List<Object[]> departmentSummaries(@Param("organizationId") UUID organizationId);
}
