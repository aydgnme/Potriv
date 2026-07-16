package me.aydgn.potriv.allocation.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;
import me.aydgn.potriv.allocation.entity.AssignmentProposalStatus;
import me.aydgn.potriv.allocation.entity.ProjectAssignmentProposal;

public interface ProjectAssignmentProposalRepository
    extends JpaRepository<ProjectAssignmentProposal, UUID> {

    boolean existsByProject_IdAndEmployee_IdAndStatus(
        UUID projectId, UUID employeeId, AssignmentProposalStatus status);

    List<ProjectAssignmentProposal> findByProject_Id(UUID projectId);

    // Employees with a proposal of the given status on a project, in one query.
    @Query("select p.employee.id from ProjectAssignmentProposal p "
        + "where p.project.id = :projectId and p.status = :status")
    List<UUID> findEmployeeIdsByProjectAndStatus(
        @Param("projectId") UUID projectId, @Param("status") AssignmentProposalStatus status);

    // Locks the proposal row for the accept/reject review transaction.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from ProjectAssignmentProposal p where p.id = :proposalId")
    Optional<ProjectAssignmentProposal> findByIdForUpdate(@Param("proposalId") UUID proposalId);

    // Department review queue: proposals for a review department in a given
    // status, oldest first. Related summaries are fetch-joined to avoid N+1
    // (reviewedBy is a left join because it is null while pending).
    @Query("select distinct p from ProjectAssignmentProposal p "
        + "join fetch p.project "
        + "join fetch p.employee "
        + "join fetch p.reviewDepartment "
        + "join fetch p.proposedBy "
        + "left join fetch p.reviewedBy "
        + "where p.reviewDepartment.id = :reviewDepartmentId and p.status = :status "
        + "order by p.createdAt asc")
    List<ProjectAssignmentProposal> findForReview(
        @Param("reviewDepartmentId") UUID reviewDepartmentId,
        @Param("status") AssignmentProposalStatus status);
}
