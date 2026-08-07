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
import me.aydgn.potriv.allocation.dto.ProposalCapacityContext;
import me.aydgn.potriv.allocation.entity.AssignmentProposalStatus;
import me.aydgn.potriv.allocation.dto.DepartmentProjectProposalResponse.ProjectSummary;
import me.aydgn.potriv.allocation.dto.ProjectProposalStatusFilter;
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
    private final ProposalCapacityContextFactory capacityContextFactory;

    public AssignmentProposalMapper(
        ProjectAssignmentProposalRoleRepository proposalRoleRepository,
        ProposalCapacityContextFactory capacityContextFactory
    ) {
        this.proposalRoleRepository = proposalRoleRepository;
        this.capacityContextFactory = capacityContextFactory;
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

        // One capacity query for the whole page, not one per row. Only pending rows
        // need it: a decided proposal has nothing left to check.
        List<UUID> pendingEmployeeIds = proposals.stream()
            .filter(proposal -> proposal.getStatus() == AssignmentProposalStatus.PENDING)
            .map(proposal -> proposal.getEmployee().getId())
            .distinct()
            .toList();
        Map<UUID, Integer> allocatedHours = capacityContextFactory.allocatedHoursFor(
            pendingEmployeeIds);

        return proposals.stream()
            .map(proposal -> buildDepartmentResponse(
                proposal,
                rolesByProposal.getOrDefault(proposal.getId(), List.of()),
                capacityFor(proposal, allocatedHours)))
            .toList();
    }

    /**
     * Capacity context belongs to a decision that is still open. A proposal that
     * has already been accepted or rejected gets none rather than a figure that
     * looks actionable.
     */
    private ProposalCapacityContext capacityFor(
        ProjectAssignmentProposal proposal, Map<UUID, Integer> allocatedHours) {
        if (proposal.getStatus() != AssignmentProposalStatus.PENDING) {
            return null;
        }
        return capacityContextFactory.build(
            allocatedHours.getOrDefault(proposal.getEmployee().getId(), 0),
            proposal.getWorkHoursPerDay());
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
        ProjectAssignmentProposal proposal,
        List<TeamRoleSummary> teamRoles,
        ProposalCapacityContext capacity) {
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
            null,
            null,
            ProjectProposalStatusFilter.of(proposal.getStatus()),
            userSummary(proposal.getProposedBy()),
            proposal.getCreatedAt(),
            userSummary(proposal.getReviewedBy()),
            proposal.getReviewedAt(),
            capacity);
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
