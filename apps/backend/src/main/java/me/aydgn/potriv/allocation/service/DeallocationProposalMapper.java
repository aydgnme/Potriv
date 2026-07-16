package me.aydgn.potriv.allocation.service;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import me.aydgn.potriv.allocation.dto.AssignmentProposalResponse.DepartmentSummary;
import me.aydgn.potriv.allocation.dto.AssignmentProposalResponse.TeamRoleSummary;
import me.aydgn.potriv.allocation.dto.AssignmentProposalResponse.UserSummary;
import me.aydgn.potriv.allocation.dto.DeallocationProposalResponse;
import me.aydgn.potriv.allocation.dto.DepartmentProjectProposalResponse;
import me.aydgn.potriv.allocation.dto.DepartmentProjectProposalResponse.ProjectSummary;
import me.aydgn.potriv.allocation.dto.ProjectAllocationResponse;
import me.aydgn.potriv.allocation.dto.ProjectProposalStatusFilter;
import me.aydgn.potriv.allocation.entity.ProjectAllocation;
import me.aydgn.potriv.allocation.entity.ProjectDeallocationProposal;
import me.aydgn.potriv.allocation.repository.ProjectAssignmentProposalRoleRepository;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.organization.entity.Department;
import me.aydgn.potriv.project.entity.Project;

/**
 * Maps deallocation proposals to safe response DTOs. Review-queue rows include
 * the allocation's hours and the approved assignment proposal's role snapshot,
 * loaded in one batch to avoid N+1.
 */
@Component
public class DeallocationProposalMapper {

    private final ProjectAssignmentProposalRoleRepository proposalRoleRepository;

    public DeallocationProposalMapper(
        ProjectAssignmentProposalRoleRepository proposalRoleRepository
    ) {
        this.proposalRoleRepository = proposalRoleRepository;
    }

    public DeallocationProposalResponse toResponse(ProjectDeallocationProposal proposal) {
        ProjectAllocation allocation = proposal.getAllocation();
        Project project = allocation.getProject();
        User employee = allocation.getEmployee();
        Department department = proposal.getReviewDepartment();
        return new DeallocationProposalResponse(
            proposal.getId(),
            allocation.getId(),
            new ProjectSummary(project.getId(), project.getName(), project.getStatus()),
            userSummary(employee),
            new DepartmentSummary(department.getId(), department.getName()),
            proposal.getReason(),
            proposal.getStatus(),
            userSummary(proposal.getProposedBy()),
            proposal.getCreatedAt(),
            userSummary(proposal.getReviewedBy()),
            proposal.getReviewedAt());
    }

    public ProjectAllocationResponse toAllocationResponse(ProjectAllocation allocation) {
        User employee = allocation.getEmployee();
        return new ProjectAllocationResponse(
            allocation.getId(),
            allocation.getProject().getId(),
            userSummary(employee),
            allocation.getAssignmentProposal().getId(),
            allocation.getWorkHoursPerDay(),
            allocation.getAllocatedAt(),
            allocation.getDeallocatedAt(),
            allocation.getAssignmentProposal().getStatus());
    }

    public List<DepartmentProjectProposalResponse> toDepartmentResponses(
        List<ProjectDeallocationProposal> proposals) {
        if (proposals.isEmpty()) {
            return List.of();
        }

        // One batch role query keyed by the allocations' assignment proposal IDs.
        List<UUID> assignmentProposalIds = proposals.stream()
            .map(proposal -> proposal.getAllocation().getAssignmentProposal().getId())
            .distinct()
            .toList();
        Map<UUID, List<TeamRoleSummary>> rolesByAssignmentProposal = proposalRoleRepository
            .findByProposalIdsWithTeamRole(assignmentProposalIds).stream()
            .collect(Collectors.groupingBy(
                role -> role.getProposal().getId(),
                Collectors.mapping(
                    role -> new TeamRoleSummary(
                        role.getTeamRole().getId(), role.getTeamRole().getName()),
                    Collectors.toList())));

        return proposals.stream()
            .map(proposal -> buildDepartmentResponse(
                proposal,
                rolesByAssignmentProposal.getOrDefault(
                    proposal.getAllocation().getAssignmentProposal().getId(), List.of())))
            .toList();
    }

    private DepartmentProjectProposalResponse buildDepartmentResponse(
        ProjectDeallocationProposal proposal, List<TeamRoleSummary> teamRoles) {
        ProjectAllocation allocation = proposal.getAllocation();
        Project project = allocation.getProject();
        Department department = proposal.getReviewDepartment();
        return new DepartmentProjectProposalResponse(
            DepartmentProjectProposalResponse.TYPE_DEALLOCATION,
            proposal.getId(),
            new ProjectSummary(project.getId(), project.getName(), project.getStatus()),
            userSummary(allocation.getEmployee()),
            new DepartmentSummary(department.getId(), department.getName()),
            allocation.getWorkHoursPerDay(),
            teamRoles,
            null,
            allocation.getId(),
            proposal.getReason(),
            ProjectProposalStatusFilter.of(proposal.getStatus()),
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
}
