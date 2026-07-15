package me.aydgn.potriv.allocation.service;

import java.util.UUID;

import org.springframework.stereotype.Component;

import me.aydgn.potriv.allocation.repository.ProjectAllocationRepository;
import me.aydgn.potriv.allocation.repository.ProjectAssignmentProposalRepository;
import me.aydgn.potriv.allocation.repository.ProjectAssignmentProposalRoleRepository;
import me.aydgn.potriv.project.service.ProjectDeletionContributor;

/**
 * Cleans up allocation data for a project that is being deleted, in FK-safe
 * order: allocations (which reference proposals) first, then proposal role
 * snapshots, then proposals. Runs inside the project delete transaction. It
 * removes only allocation-owned rows — never users, departments, team roles or
 * organizations.
 */
@Component
public class AssignmentProposalProjectDeletionContributor implements ProjectDeletionContributor {

    private final ProjectAllocationRepository allocationRepository;
    private final ProjectAssignmentProposalRepository proposalRepository;
    private final ProjectAssignmentProposalRoleRepository proposalRoleRepository;

    public AssignmentProposalProjectDeletionContributor(
        ProjectAllocationRepository allocationRepository,
        ProjectAssignmentProposalRepository proposalRepository,
        ProjectAssignmentProposalRoleRepository proposalRoleRepository
    ) {
        this.allocationRepository = allocationRepository;
        this.proposalRepository = proposalRepository;
        this.proposalRoleRepository = proposalRoleRepository;
    }

    @Override
    public void beforeProjectDelete(UUID projectId) {
        // ProjectAllocation references ProjectAssignmentProposal, so allocations
        // must be deleted before the proposals they point at.
        allocationRepository.deleteByProjectId(projectId);
        allocationRepository.flush();
        proposalRoleRepository.deleteByProjectId(projectId);
        proposalRoleRepository.flush();
        proposalRepository.deleteAll(proposalRepository.findByProject_Id(projectId));
        proposalRepository.flush();
    }
}
