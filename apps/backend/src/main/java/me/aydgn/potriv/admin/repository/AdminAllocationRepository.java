package me.aydgn.potriv.admin.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import me.aydgn.potriv.allocation.entity.ProjectAllocation;

public interface AdminAllocationRepository extends Repository<ProjectAllocation, UUID> {

    @Query(value = "select a from ProjectAllocation a "
        + "left join fetch a.employee "
        + "left join fetch a.project "
        + "left join fetch a.assignmentProposal ap "
        + "left join fetch ap.reviewDepartment "
        + "where (lower(a.employee.name) like :pattern "
        + "  or lower(a.project.name) like :pattern) "
        + "and (:activeOnly = false or a.deallocatedAt is null)",
        countQuery = "select count(a) from ProjectAllocation a "
            + "where (lower(a.employee.name) like :pattern "
            + "  or lower(a.project.name) like :pattern) "
            + "and (:activeOnly = false or a.deallocatedAt is null)")
    Page<ProjectAllocation> search(
        @Param("pattern") String pattern, @Param("activeOnly") boolean activeOnly,
        Pageable pageable);

    @Query("select a from ProjectAllocation a "
        + "left join fetch a.employee "
        + "left join fetch a.project "
        + "left join fetch a.assignmentProposal ap "
        + "left join fetch ap.reviewDepartment "
        + "where a.id = :id")
    Optional<ProjectAllocation> findDetailById(@Param("id") UUID id);
}
