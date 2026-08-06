package me.aydgn.potriv.admin.repository;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import me.aydgn.potriv.allocation.entity.ProjectAllocation;

/**
 * Read-only projections for the admin allocation review page.
 *
 * <p>Optional id filters use the {@code (:id is null or ...)} form. The date
 * bounds deliberately do <strong>not</strong>: a null {@code timestamptz} bind
 * leaves Postgres unable to infer the parameter type ("could not determine data
 * type of parameter"), the same class of failure {@code AdminPaging.likePattern}
 * documents for {@code lower(bytea)}. The service passes wide sentinel bounds
 * instead, so the parameter is always typed.
 */
public interface AdminAllocationRepository extends Repository<ProjectAllocation, UUID> {

    @Query(value = "select a from ProjectAllocation a "
        + "left join fetch a.employee "
        + "left join fetch a.project p "
        + "left join fetch p.organization "
        + "left join fetch a.assignmentProposal ap "
        + "left join fetch ap.reviewDepartment "
        + "where (lower(a.employee.name) like :pattern "
        + "  or lower(a.project.name) like :pattern) "
        + "and (:organizationId is null or a.project.organization.id = :organizationId) "
        + "and (:projectId is null or a.project.id = :projectId) "
        + "and (:employeeId is null or a.employee.id = :employeeId) "
        + "and (:departmentId is null "
        + "  or a.assignmentProposal.reviewDepartment.id = :departmentId) "
        + "and (:activeOnly = false or a.deallocatedAt is null) "
        + "and (:pastOnly = false or a.deallocatedAt is not null) "
        + "and a.allocatedAt >= :from and a.allocatedAt <= :to ",
        countQuery = "select count(a) from ProjectAllocation a "
            + "where (lower(a.employee.name) like :pattern "
            + "  or lower(a.project.name) like :pattern) "
            + "and (:organizationId is null or a.project.organization.id = :organizationId) "
        + "and (:projectId is null or a.project.id = :projectId) "
        + "and (:employeeId is null or a.employee.id = :employeeId) "
        + "and (:departmentId is null "
        + "  or a.assignmentProposal.reviewDepartment.id = :departmentId) "
        + "and (:activeOnly = false or a.deallocatedAt is null) "
        + "and (:pastOnly = false or a.deallocatedAt is not null) "
        + "and a.allocatedAt >= :from and a.allocatedAt <= :to ")
    Page<ProjectAllocation> search(
        @Param("pattern") String pattern,
        @Param("organizationId") UUID organizationId,
        @Param("projectId") UUID projectId,
        @Param("employeeId") UUID employeeId,
        @Param("departmentId") UUID departmentId,
        @Param("activeOnly") boolean activeOnly,
        @Param("pastOnly") boolean pastOnly,
        @Param("from") OffsetDateTime from,
        @Param("to") OffsetDateTime to,
        Pageable pageable);

    @Query("select a from ProjectAllocation a "
        + "left join fetch a.employee "
        + "left join fetch a.project p "
        + "left join fetch p.organization "
        + "left join fetch a.assignmentProposal ap "
        + "left join fetch ap.reviewDepartment "
        + "left join fetch ap.proposedBy "
        + "left join fetch ap.reviewedBy "
        + "where a.id = :id")
    Optional<ProjectAllocation> findDetailById(@Param("id") UUID id);
}
