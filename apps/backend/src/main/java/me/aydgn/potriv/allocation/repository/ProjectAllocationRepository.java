package me.aydgn.potriv.allocation.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;
import me.aydgn.potriv.allocation.entity.ProjectAllocation;
import me.aydgn.potriv.project.entity.ProjectStatus;

public interface ProjectAllocationRepository extends JpaRepository<ProjectAllocation, UUID> {

    boolean existsByProject_IdAndEmployee_IdAndDeallocatedAtIsNull(UUID projectId, UUID employeeId);

    // Team-view visibility: the employee has (or had) any allocation episode.
    boolean existsByProject_IdAndEmployee_Id(UUID projectId, UUID employeeId);

    // Employee self-view: one user's active allocation episodes in the current
    // organization, with project and proposal fetch-joined to avoid N+1.
    @Query("select distinct a from ProjectAllocation a "
        + "join fetch a.project "
        + "join fetch a.assignmentProposal "
        + "where a.employee.id = :employeeId "
        + "and a.project.organization.id = :organizationId "
        + "and a.deallocatedAt is null")
    List<ProjectAllocation> findCurrentByEmployeeIdAndOrganizationIdWithDetails(
        @Param("employeeId") UUID employeeId, @Param("organizationId") UUID organizationId);

    // Employee self-view: one user's ended allocation episodes, same fetch shape.
    @Query("select distinct a from ProjectAllocation a "
        + "join fetch a.project "
        + "join fetch a.assignmentProposal "
        + "where a.employee.id = :employeeId "
        + "and a.project.organization.id = :organizationId "
        + "and a.deallocatedAt is not null")
    List<ProjectAllocation> findPastByEmployeeIdAndOrganizationIdWithDetails(
        @Param("employeeId") UUID employeeId, @Param("organizationId") UUID organizationId);

    // Team view: active allocations of one project with all mapped summaries
    // fetch-joined (reviewedBy is a left join because legacy rows could lack it).
    @Query("select distinct a from ProjectAllocation a "
        + "join fetch a.employee "
        + "join fetch a.assignmentProposal ap "
        + "join fetch ap.reviewDepartment "
        + "join fetch ap.proposedBy "
        + "left join fetch ap.reviewedBy "
        + "where a.project.id = :projectId and a.deallocatedAt is null")
    List<ProjectAllocation> findActiveByProjectIdWithDetails(@Param("projectId") UUID projectId);

    // Team view: ended allocations of one project, same fetch shape.
    @Query("select distinct a from ProjectAllocation a "
        + "join fetch a.employee "
        + "join fetch a.assignmentProposal ap "
        + "join fetch ap.reviewDepartment "
        + "join fetch ap.proposedBy "
        + "left join fetch ap.reviewedBy "
        + "where a.project.id = :projectId and a.deallocatedAt is not null")
    List<ProjectAllocation> findPastByProjectIdWithDetails(@Param("projectId") UUID projectId);

    // Locks the allocation row for deallocation proposal creation and review.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from ProjectAllocation a where a.id = :allocationId")
    Optional<ProjectAllocation> findByIdForUpdate(@Param("allocationId") UUID allocationId);

    @Query("select a from ProjectAllocation a "
        + "where a.project.id = :projectId and a.employee.id = :employeeId "
        + "and a.deallocatedAt is null")
    List<ProjectAllocation> findActiveByProjectAndEmployee(
        @Param("projectId") UUID projectId, @Param("employeeId") UUID employeeId);

    @Query("select a from ProjectAllocation a "
        + "join fetch a.employee "
        + "where a.project.id = :projectId and a.deallocatedAt is null")
    List<ProjectAllocation> findActiveByProject(@Param("projectId") UUID projectId);

    // Sum of an employee's active, capacity-consuming allocation hours.
    @Query("select coalesce(sum(a.workHoursPerDay), 0) from ProjectAllocation a "
        + "where a.employee.id = :employeeId "
        + "and a.deallocatedAt is null "
        + "and a.project.status in :statuses")
    int sumActiveCapacityHours(
        @Param("employeeId") UUID employeeId,
        @Param("statuses") Collection<ProjectStatus> statuses);

    // Same as above but excluding a given project (used by the activation guard).
    @Query("select coalesce(sum(a.workHoursPerDay), 0) from ProjectAllocation a "
        + "where a.employee.id = :employeeId "
        + "and a.deallocatedAt is null "
        + "and a.project.id <> :excludedProjectId "
        + "and a.project.status in :statuses")
    int sumActiveCapacityHoursExcludingProject(
        @Param("employeeId") UUID employeeId,
        @Param("excludedProjectId") UUID excludedProjectId,
        @Param("statuses") Collection<ProjectStatus> statuses);

    @Modifying
    @Query("delete from ProjectAllocation a where a.project.id = :projectId")
    void deleteByProjectId(@Param("projectId") UUID projectId);

    // Batch load: active allocations (with project) for a set of employees.
    @Query("select a from ProjectAllocation a "
        + "join fetch a.project "
        + "where a.employee.id in :employeeIds and a.deallocatedAt is null")
    List<ProjectAllocation> findActiveByEmployeeIdsWithProject(
        @Param("employeeIds") Collection<UUID> employeeIds);

    // Batch load: ended (deallocated) same-organization allocations for a set of
    // employees, with project and assignment proposal for similarity matching.
    @Query("select a from ProjectAllocation a "
        + "join fetch a.project "
        + "join fetch a.assignmentProposal "
        + "where a.employee.id in :employeeIds "
        + "and a.deallocatedAt is not null "
        + "and a.project.organization.id = :organizationId")
    List<ProjectAllocation> findPastByEmployeeIdsWithProject(
        @Param("employeeIds") Collection<UUID> employeeIds,
        @Param("organizationId") UUID organizationId);
}
