package me.aydgn.potriv.allocation.service;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import me.aydgn.potriv.allocation.dto.AssignmentProposalResponse;
import me.aydgn.potriv.allocation.dto.AssignmentProposalResponse.DepartmentSummary;
import me.aydgn.potriv.allocation.dto.AssignmentProposalResponse.TeamRoleSummary;
import me.aydgn.potriv.allocation.dto.AssignmentProposalResponse.UserSummary;
import me.aydgn.potriv.allocation.dto.DepartmentProjectProposalResponse;
import me.aydgn.potriv.allocation.dto.DepartmentProjectProposalResponse.ProjectSummary;
import me.aydgn.potriv.allocation.entity.ProjectAssignmentProposal;
import me.aydgn.potriv.allocation.entity.ProjectAssignmentProposalRole;
import me.aydgn.potriv.allocation.repository.ProjectAssignmentProposalRoleRepository;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.organization.entity.Department;
import me.aydgn.potriv.organization.entity.TeamRole;
import me.aydgn.potriv.project.entity.Project;

/**
 * Maps assignment proposals to safe response DTOs, loading role snapshots
 * without N+1 (single lookup for one proposal, batch grouping for a list).
 */
@Component
public class AssignmentProposalMapper {

    private final ProjectAssignmentProposalRoleRepository proposalRoleRepository;

    public AssignmentProposalMapper(
        ProjectAssignmentProposalRoleRepository proposalRoleRepository
    ) {
        this.proposalRoleRepository = proposalRoleRepository;
    }

    public AssignmentProposalResponse toResponse(ProjectAssignmentProposal proposal) {
        List<TeamRoleSummary> teamRoles = proposalRoleRepository
            .findByProposalIdWithTeamRole(proposal.getId()).stream()
            .map(AssignmentProposalMapper::teamRoleSummary)
            .toList();
        return buildResponse(proposal, teamRoles);
    }

    public List<DepartmentProjectProposalResponse> toDepartmentResponses(
        List<ProjectAssignmentProposal> proposals) {
        if (proposals.isEmpty()) {
            return List.of();
        }

        List<UUID> ids = proposals.stream().map(ProjectAssignmentProposal::getId).toList();
        Map<UUID, List<TeamRoleSummary>> rolesByProposal = proposalRoleRepository
            .findByProposalIdsWithTeamRole(ids).stream()
            .collect(Collectors.groupingBy(
                role -> role.getProposal().getId(),
                Collectors.mapping(AssignmentProposalMapper::teamRoleSummary, Collectors.toList())));

        return proposals.stream()
            .map(proposal -> buildDepartmentResponse(
                proposal, rolesByProposal.getOrDefault(proposal.getId(), List.of())))
            .toList();
    }

    private AssignmentProposalResponse buildResponse(
        ProjectAssignmentProposal proposal, List<TeamRoleSummary> teamRoles) {
        Department department = proposal.getReviewDepartment();
        return new AssignmentProposalResponse(
            proposal.getId(),
            proposal.getProject().getId(),
            userSummary(proposal.getEmployee()),
            new DepartmentSummary(department.getId(), department.getName()),
            proposal.getWorkHoursPerDay(),
            teamRoles,
            proposal.getComments(),
            proposal.getStatus(),
            userSummary(proposal.getProposedBy()),
            proposal.getCreatedAt(),
            userSummary(proposal.getReviewedBy()),
            proposal.getReviewedAt());
    }

    private DepartmentProjectProposalResponse buildDepartmentResponse(
        ProjectAssignmentProposal proposal, List<TeamRoleSummary> teamRoles) {
        Project project = proposal.getProject();
        Department department = proposal.getReviewDepartment();
        return new DepartmentProjectProposalResponse(
            DepartmentProjectProposalResponse.TYPE_ASSIGNMENT,
            proposal.getId(),
            new ProjectSummary(project.getId(), project.getName(), project.getStatus()),
            userSummary(proposal.getEmployee()),
            new DepartmentSummary(department.getId(), department.getName()),
            proposal.getWorkHoursPerDay(),
            teamRoles,
            proposal.getComments(),
            proposal.getStatus(),
            userSummary(proposal.getProposedBy()),
            proposal.getCreatedAt(),
            userSummary(proposal.getReviewedBy()),
            proposal.getReviewedAt());
    }

    private static UserSummary userSummary(User user) {
        if (user == null) {
            return null;
        }
        return new UserSummary(user.getId(), user.getName(), user.getEmail());
    }

    private static TeamRoleSummary teamRoleSummary(ProjectAssignmentProposalRole role) {
        TeamRole teamRole = role.getTeamRole();
        return new TeamRoleSummary(teamRole.getId(), teamRole.getName());
    }
}
