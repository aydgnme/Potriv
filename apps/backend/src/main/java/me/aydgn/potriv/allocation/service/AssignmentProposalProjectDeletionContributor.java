package me.aydgn.potriv.allocation.service;

import java.util.UUID;

import org.springframework.stereotype.Component;

import me.aydgn.potriv.allocation.repository.ProjectAssignmentProposalRepository;
import me.aydgn.potriv.allocation.repository.ProjectAssignmentProposalRoleRepository;
import me.aydgn.potriv.project.service.ProjectDeletionContributor;

/**
 * Cleans up assignment proposals (and their role snapshots) for a project that
 * is being deleted. Runs inside the project delete transaction. It removes only
 * allocation-owned rows — never users, departments, team roles or organizations.
 */
@Component
public class AssignmentProposalProjectDeletionContributor implements ProjectDeletionContributor {

    private final ProjectAssignmentProposalRepository proposalRepository;
    private final ProjectAssignmentProposalRoleRepository proposalRoleRepository;

    public AssignmentProposalProjectDeletionContributor(
        ProjectAssignmentProposalRepository proposalRepository,
        ProjectAssignmentProposalRoleRepository proposalRoleRepository
    ) {
        this.proposalRepository = proposalRepository;
        this.proposalRoleRepository = proposalRoleRepository;
    }

    @Override
    public void beforeProjectDelete(UUID projectId) {
        proposalRoleRepository.deleteByProjectId(projectId);
        proposalRoleRepository.flush();
        proposalRepository.deleteAll(proposalRepository.findByProject_Id(projectId));
        proposalRepository.flush();
    }
}
