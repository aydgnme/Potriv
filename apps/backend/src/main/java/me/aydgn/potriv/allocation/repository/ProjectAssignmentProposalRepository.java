package me.aydgn.potriv.allocation.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import me.aydgn.potriv.allocation.entity.AssignmentProposalStatus;
import me.aydgn.potriv.allocation.entity.ProjectAssignmentProposal;

public interface ProjectAssignmentProposalRepository
    extends JpaRepository<ProjectAssignmentProposal, UUID> {

    boolean existsByProject_IdAndEmployee_IdAndStatus(
        UUID projectId, UUID employeeId, AssignmentProposalStatus status);

    List<ProjectAssignmentProposal> findByProject_Id(UUID projectId);
}
