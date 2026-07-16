package me.aydgn.potriv.allocation.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;
import me.aydgn.potriv.allocation.entity.DeallocationProposalStatus;
import me.aydgn.potriv.allocation.entity.ProjectDeallocationProposal;

public interface ProjectDeallocationProposalRepository
    extends JpaRepository<ProjectDeallocationProposal, UUID> {

    boolean existsByAllocation_IdAndStatus(UUID allocationId, DeallocationProposalStatus status);

    // Locks the proposal row for the accept/reject review transaction.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from ProjectDeallocationProposal p where p.id = :proposalId")
    Optional<ProjectDeallocationProposal> findByIdForUpdate(@Param("proposalId") UUID proposalId);

    // Department review queue: deallocation proposals for a review department in
    // a given status, oldest first. Related summaries (including the allocation's
    // project/employee/assignment proposal for role lookup) are fetch-joined to
    // avoid N+1; reviewedBy is a left join because it is null while pending.
    @Query("select distinct p from ProjectDeallocationProposal p "
        + "join fetch p.allocation a "
        + "join fetch a.project "
        + "join fetch a.employee "
        + "join fetch a.assignmentProposal "
        + "join fetch p.reviewDepartment "
        + "join fetch p.proposedBy "
        + "left join fetch p.reviewedBy "
        + "where p.reviewDepartment.id = :reviewDepartmentId and p.status = :status "
        + "order by p.createdAt asc")
    List<ProjectDeallocationProposal> findForReview(
        @Param("reviewDepartmentId") UUID reviewDepartmentId,
        @Param("status") DeallocationProposalStatus status);

    // Bulk cleanup for all proposals of a project's allocations, used by the
    // project-delete integration.
    @Modifying
    @Query("delete from ProjectDeallocationProposal p "
        + "where p.allocation.id in (select a.id from ProjectAllocation a "
        + "where a.project.id = :projectId)")
    void deleteByProjectId(@Param("projectId") UUID projectId);
}
