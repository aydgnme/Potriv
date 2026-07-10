package me.aydgn.potriv.allocation.service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.allocation.dto.AssignmentProposalResponse;
import me.aydgn.potriv.allocation.dto.AssignmentProposalResponse.DepartmentSummary;
import me.aydgn.potriv.allocation.dto.AssignmentProposalResponse.TeamRoleSummary;
import me.aydgn.potriv.allocation.dto.AssignmentProposalResponse.UserSummary;
import me.aydgn.potriv.allocation.dto.CreateAssignmentProposalRequest;
import me.aydgn.potriv.allocation.entity.AssignmentProposalStatus;
import me.aydgn.potriv.allocation.entity.ProjectAssignmentProposal;
import me.aydgn.potriv.allocation.entity.ProjectAssignmentProposalRole;
import me.aydgn.potriv.allocation.repository.ProjectAssignmentProposalRepository;
import me.aydgn.potriv.allocation.repository.ProjectAssignmentProposalRoleRepository;
import me.aydgn.potriv.common.exception.BadRequestException;
import me.aydgn.potriv.common.exception.ConflictException;
import me.aydgn.potriv.common.exception.NotFoundException;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.CurrentOrganizationResolver;
import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.identity.repository.UserRoleRepository;
import me.aydgn.potriv.organization.entity.Department;
import me.aydgn.potriv.organization.entity.TeamRole;
import me.aydgn.potriv.organization.repository.DepartmentMembershipRepository;
import me.aydgn.potriv.organization.repository.TeamRoleRepository;
import me.aydgn.potriv.project.entity.Project;
import me.aydgn.potriv.project.service.ProjectService;

@Service
public class AssignmentProposalService {

    private final ProjectService projectService;
    private final ProjectAssignmentProposalRepository proposalRepository;
    private final ProjectAssignmentProposalRoleRepository proposalRoleRepository;
    private final UserRepository userRepository;
    private final UserRoleRepository userRoleRepository;
    private final DepartmentMembershipRepository departmentMembershipRepository;
    private final TeamRoleRepository teamRoleRepository;
    private final EmployeeCapacityService employeeCapacityService;
    private final CurrentOrganizationResolver currentOrganizationResolver;

    public AssignmentProposalService(
        ProjectService projectService,
        ProjectAssignmentProposalRepository proposalRepository,
        ProjectAssignmentProposalRoleRepository proposalRoleRepository,
        UserRepository userRepository,
        UserRoleRepository userRoleRepository,
        DepartmentMembershipRepository departmentMembershipRepository,
        TeamRoleRepository teamRoleRepository,
        EmployeeCapacityService employeeCapacityService,
        CurrentOrganizationResolver currentOrganizationResolver
    ) {
        this.projectService = projectService;
        this.proposalRepository = proposalRepository;
        this.proposalRoleRepository = proposalRoleRepository;
        this.userRepository = userRepository;
        this.userRoleRepository = userRoleRepository;
        this.departmentMembershipRepository = departmentMembershipRepository;
        this.teamRoleRepository = teamRoleRepository;
        this.employeeCapacityService = employeeCapacityService;
        this.currentOrganizationResolver = currentOrganizationResolver;
    }

    @Transactional
    public AssignmentProposalResponse create(
        AuthenticatedUser currentUser,
        UUID projectId,
        CreateAssignmentProposalRequest request
    ) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);

        // Owner-scoped project resolution (cross-org / non-owner -> 404).
        Project project = projectService.requireManagedProject(currentUser, projectId);

        // Pessimistically lock the target employee row for the rest of the tx.
        User employee = userRepository.findByIdForUpdate(request.employeeId())
            .filter(user -> user.getOrganization() != null
                && user.getOrganization().getId().equals(organizationId))
            .orElseThrow(() -> new NotFoundException("Employee was not found."));

        // Current EMPLOYEE role must come from the database, not JWT claims.
        if (!userRoleRepository.existsByUserAndRole(employee, AccessRole.EMPLOYEE)) {
            throw new BadRequestException("Target user must currently hold the EMPLOYEE role.");
        }

        // Review department is a snapshot of the employee's current membership.
        Department reviewDepartment = departmentMembershipRepository
            .findByMember_Id(employee.getId())
            .map(membership -> membership.getDepartment())
            .orElseThrow(() -> new ConflictException(
                "The employee has no department membership and cannot be reviewed."));

        validateRequestedHours(employee.getId(), request.workHoursPerDay());

        if (proposalRepository.existsByProject_IdAndEmployee_IdAndStatus(
            projectId, employee.getId(), AssignmentProposalStatus.PENDING)) {
            throw new ConflictException(
                "A pending assignment proposal already exists for this employee on this project.");
        }

        List<TeamRole> teamRoles = resolveTeamRoles(organizationId, request.teamRoleIds());

        // The owner of the project is the proposing (authenticated) project manager.
        User proposedBy = project.getProjectManager();

        ProjectAssignmentProposal proposal = proposalRepository.save(
            new ProjectAssignmentProposal(
                project,
                employee,
                reviewDepartment,
                request.workHoursPerDay(),
                trimToNull(request.comments()),
                AssignmentProposalStatus.PENDING,
                proposedBy));

        List<ProjectAssignmentProposalRole> proposalRoles = teamRoles.stream()
            .map(teamRole -> new ProjectAssignmentProposalRole(proposal, teamRole))
            .toList();
        proposalRoleRepository.saveAll(proposalRoles);

        return toResponse(proposal);
    }

    private void validateRequestedHours(UUID employeeId, int workHoursPerDay) {
        if (workHoursPerDay < 1) {
            throw new BadRequestException("workHoursPerDay must be at least 1.");
        }
        if (workHoursPerDay > EmployeeCapacityService.MAX_HOURS_PER_DAY) {
            throw new ConflictException("workHoursPerDay exceeds the 8 hour daily maximum.");
        }

        int availableHours = employeeCapacityService.availableHours(employeeId);
        if (availableHours <= 0) {
            throw new ConflictException("The employee has no available capacity.");
        }
        if (workHoursPerDay > availableHours) {
            throw new ConflictException(
                "workHoursPerDay exceeds the employee's available capacity of "
                    + availableHours + " hours.");
        }
    }

    private List<TeamRole> resolveTeamRoles(UUID organizationId, List<UUID> teamRoleIds) {
        if (teamRoleIds == null || teamRoleIds.isEmpty()) {
            throw new BadRequestException("At least one team role is required.");
        }

        List<TeamRole> teamRoles = new ArrayList<>();
        Set<UUID> seen = new HashSet<>();
        for (UUID teamRoleId : teamRoleIds) {
            if (teamRoleId == null) {
                throw new BadRequestException("Team role id must not be null.");
            }
            if (!seen.add(teamRoleId)) {
                throw new BadRequestException("Duplicate team role in the request.");
            }
            TeamRole teamRole = teamRoleRepository
                .findByIdAndOrganization_Id(teamRoleId, organizationId)
                .orElseThrow(() -> new NotFoundException("Team role was not found."));
            if (!teamRole.isActive()) {
                throw new BadRequestException("Team role is inactive: " + teamRole.getName());
            }
            teamRoles.add(teamRole);
        }
        return teamRoles;
    }

    private AssignmentProposalResponse toResponse(ProjectAssignmentProposal proposal) {
        User employee = proposal.getEmployee();
        Department department = proposal.getReviewDepartment();
        User proposedBy = proposal.getProposedBy();

        List<TeamRoleSummary> teamRoles = proposalRoleRepository
            .findByProposalIdWithTeamRole(proposal.getId()).stream()
            .map(role -> new TeamRoleSummary(
                role.getTeamRole().getId(), role.getTeamRole().getName()))
            .toList();

        return new AssignmentProposalResponse(
            proposal.getId(),
            proposal.getProject().getId(),
            new UserSummary(employee.getId(), employee.getName(), employee.getEmail()),
            new DepartmentSummary(department.getId(), department.getName()),
            proposal.getWorkHoursPerDay(),
            teamRoles,
            proposal.getComments(),
            proposal.getStatus(),
            new UserSummary(proposedBy.getId(), proposedBy.getName(), proposedBy.getEmail()),
            proposal.getCreatedAt(),
            reviewedBySummary(proposal),
            proposal.getReviewedAt());
    }

    private UserSummary reviewedBySummary(ProjectAssignmentProposal proposal) {
        User reviewedBy = proposal.getReviewedBy();
        if (reviewedBy == null) {
            return null;
        }
        return new UserSummary(reviewedBy.getId(), reviewedBy.getName(), reviewedBy.getEmail());
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
