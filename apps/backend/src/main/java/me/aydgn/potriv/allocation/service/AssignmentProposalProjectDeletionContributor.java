package me.aydgn.potriv.allocation.service;

import java.util.UUID;

import org.springframework.stereotype.Component;

import me.aydgn.potriv.allocation.repository.ProjectAllocationRepository;
import me.aydgn.potriv.allocation.repository.ProjectAssignmentProposalRepository;
import me.aydgn.potriv.allocation.repository.ProjectAssignmentProposalRoleRepository;
import me.aydgn.potriv.allocation.repository.ProjectDeallocationProposalRepository;
import me.aydgn.potriv.project.service.ProjectDeletionContributor;

/**
 * Cleans up allocation data for a project that is being deleted, in FK-safe
 * order: deallocation proposals (which reference allocations) first, then
 * allocations (which reference assignment proposals), then proposal role
 * snapshots, then assignment proposals. Runs inside the project delete
 * transaction. It removes only allocation-owned rows — never users,
 * departments, team roles or organizations.
 */
@Component
public class AssignmentProposalProjectDeletionContributor implements ProjectDeletionContributor {

    private final ProjectDeallocationProposalRepository deallocationProposalRepository;
    private final ProjectAllocationRepository allocationRepository;
    private final ProjectAssignmentProposalRepository proposalRepository;
    private final ProjectAssignmentProposalRoleRepository proposalRoleRepository;

    public AssignmentProposalProjectDeletionContributor(
        ProjectDeallocationProposalRepository deallocationProposalRepository,
        ProjectAllocationRepository allocationRepository,
        ProjectAssignmentProposalRepository proposalRepository,
        ProjectAssignmentProposalRoleRepository proposalRoleRepository
    ) {
        this.deallocationProposalRepository = deallocationProposalRepository;
        this.allocationRepository = allocationRepository;
        this.proposalRepository = proposalRepository;
        this.proposalRoleRepository = proposalRoleRepository;
    }

    @Override
    public void beforeProjectDelete(UUID projectId) {
        deallocationProposalRepository.deleteByProjectId(projectId);
        deallocationProposalRepository.flush();
        allocationRepository.deleteByProjectId(projectId);
        allocationRepository.flush();
        proposalRoleRepository.deleteByProjectId(projectId);
        proposalRoleRepository.flush();
        proposalRepository.deleteAll(proposalRepository.findByProject_Id(projectId));
        proposalRepository.flush();
    }
}
