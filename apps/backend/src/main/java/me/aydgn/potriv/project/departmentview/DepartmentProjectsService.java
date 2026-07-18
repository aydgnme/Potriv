package me.aydgn.potriv.project.departmentview;

import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.allocation.entity.ProjectAllocation;
import me.aydgn.potriv.allocation.entity.ProjectAssignmentProposalRole;
import me.aydgn.potriv.allocation.repository.ProjectAllocationRepository;
import me.aydgn.potriv.allocation.repository.ProjectAssignmentProposalRoleRepository;
import me.aydgn.potriv.common.exception.ForbiddenException;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.CurrentOrganizationResolver;
import me.aydgn.potriv.organization.entity.Department;
import me.aydgn.potriv.organization.repository.DepartmentManagerAssignmentRepository;
import me.aydgn.potriv.project.departmentview.dto.DepartmentProjectDepartmentSummary;
import me.aydgn.potriv.project.departmentview.dto.DepartmentProjectRoleSummary;
import me.aydgn.potriv.project.departmentview.dto.DepartmentProjectSummaryResponse;
import me.aydgn.potriv.project.departmentview.dto.DepartmentProjectTeamMemberResponse;
import me.aydgn.potriv.project.departmentview.dto.DepartmentProjectUserSummary;
import me.aydgn.potriv.project.departmentview.dto.DepartmentProjectsResponse;
import me.aydgn.potriv.project.entity.Project;
import me.aydgn.potriv.project.entity.ProjectStatus;

/**
 * Read-only Project-08 department portfolio view: projects where the
 * authenticated Department Manager's managed department currently has active
 * assigned members. Department involvement comes from the approved assignment
 * proposal's review-department snapshot — not from current department
 * membership — so the view stays stable when employees move departments. Only
 * active allocations ({@code deallocatedAt == null}) include a project; team
 * members are limited to the managed department's active allocations.
 */
@Service
public class DepartmentProjectsService {

    private final ProjectAllocationRepository allocationRepository;
    private final ProjectAssignmentProposalRoleRepository proposalRoleRepository;
    private final DepartmentManagerAssignmentRepository managerAssignmentRepository;
    private final CurrentOrganizationResolver currentOrganizationResolver;
    private final Clock clock;

    public DepartmentProjectsService(
        ProjectAllocationRepository allocationRepository,
        ProjectAssignmentProposalRoleRepository proposalRoleRepository,
        DepartmentManagerAssignmentRepository managerAssignmentRepository,
        CurrentOrganizationResolver currentOrganizationResolver,
        Clock clock
    ) {
        this.allocationRepository = allocationRepository;
        this.proposalRoleRepository = proposalRoleRepository;
        this.managerAssignmentRepository = managerAssignmentRepository;
        this.currentOrganizationResolver = currentOrganizationResolver;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public DepartmentProjectsResponse getDepartmentProjects(
        AuthenticatedUser currentUser,
        ProjectStatus status
    ) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);
        Department managedDepartment = requireManagedDepartment(currentUser, organizationId);

        List<ProjectAllocation> allocations = status == null
            ? allocationRepository.findActiveByReviewDepartmentIdAndOrganizationIdWithDetails(
                managedDepartment.getId(), organizationId)
            : allocationRepository
                .findActiveByReviewDepartmentIdAndOrganizationIdAndProjectStatusWithDetails(
                    managedDepartment.getId(), organizationId, status);

        // One batch query for all role snapshots.
        Set<UUID> proposalIds = allocations.stream()
            .map(allocation -> allocation.getAssignmentProposal().getId())
            .collect(Collectors.toSet());
        Map<UUID, List<DepartmentProjectRoleSummary>> rolesByProposal = proposalIds.isEmpty()
            ? Map.of()
            : proposalRoleRepository.findByProposalIdsWithTeamRole(proposalIds).stream()
                .collect(Collectors.groupingBy(
                    role -> role.getProposal().getId(),
                    Collectors.mapping(DepartmentProjectsService::roleSummary,
                        Collectors.toList())));

        Map<UUID, List<ProjectAllocation>> allocationsByProject = allocations.stream()
            .collect(Collectors.groupingBy(
                allocation -> allocation.getProject().getId(),
                LinkedHashMap::new,
                Collectors.toList()));

        List<DepartmentProjectSummaryResponse> projects = allocationsByProject.values().stream()
            .map(projectAllocations -> mapProject(projectAllocations, rolesByProposal))
            .sorted(Comparator
                .comparing(DepartmentProjectSummaryResponse::deadlineDate,
                    Comparator.nullsLast(Comparator.<LocalDate>naturalOrder()))
                .thenComparing(project -> project.projectName().toLowerCase(Locale.ROOT))
                .thenComparing(project -> project.projectId().toString()))
            .toList();

        return new DepartmentProjectsResponse(
            new DepartmentProjectDepartmentSummary(
                managedDepartment.getId(), managedDepartment.getName()),
            projects,
            OffsetDateTime.now(clock));
    }

    private Department requireManagedDepartment(
        AuthenticatedUser currentUser,
        UUID organizationId
    ) {
        // The DEPARTMENT_MANAGER role alone is not enough; an actual assignment
        // is required, matching the allocation review endpoints.
        Department managedDepartment = managerAssignmentRepository
            .findByManager_Id(currentUser.userId())
            .orElseThrow(() -> new ForbiddenException(
                "You are not assigned as a department manager."))
            .getDepartment();
        if (!managedDepartment.getOrganization().getId().equals(organizationId)) {
            throw new ForbiddenException(
                "Your managed department does not belong to the current organization.");
        }
        return managedDepartment;
    }

    private DepartmentProjectSummaryResponse mapProject(
        List<ProjectAllocation> projectAllocations,
        Map<UUID, List<DepartmentProjectRoleSummary>> rolesByProposal
    ) {
        Project project = projectAllocations.getFirst().getProject();
        List<DepartmentProjectTeamMemberResponse> teamMembers = projectAllocations.stream()
            .map(allocation -> mapTeamMember(allocation, rolesByProposal))
            .sorted(Comparator
                .comparing((DepartmentProjectTeamMemberResponse member) ->
                    member.employee().name().toLowerCase(Locale.ROOT))
                .thenComparing(DepartmentProjectTeamMemberResponse::allocatedAt)
                .thenComparing(member -> member.allocationId().toString()))
            .toList();
        return new DepartmentProjectSummaryResponse(
            project.getId(),
            project.getName(),
            project.getStatus(),
            project.getPeriod(),
            project.getStartDate(),
            project.getDeadlineDate(),
            teamMembers);
    }

    private DepartmentProjectTeamMemberResponse mapTeamMember(
        ProjectAllocation allocation,
        Map<UUID, List<DepartmentProjectRoleSummary>> rolesByProposal
    ) {
        List<DepartmentProjectRoleSummary> roles = rolesByProposal
            .getOrDefault(allocation.getAssignmentProposal().getId(), List.of()).stream()
            .sorted(Comparator
                .comparing((DepartmentProjectRoleSummary role) ->
                    role.name().toLowerCase(Locale.ROOT))
                .thenComparing(role -> role.teamRoleId().toString()))
            .toList();
        return new DepartmentProjectTeamMemberResponse(
            allocation.getId(),
            allocation.getAssignmentProposal().getId(),
            new DepartmentProjectUserSummary(
                allocation.getEmployee().getId(),
                allocation.getEmployee().getName(),
                allocation.getEmployee().getEmail()),
            allocation.getWorkHoursPerDay(),
            roles,
            allocation.getAllocatedAt());
    }

    private static DepartmentProjectRoleSummary roleSummary(ProjectAssignmentProposalRole role) {
        return new DepartmentProjectRoleSummary(
            role.getTeamRole().getId(), role.getTeamRole().getName(), role.getTeamRole().isActive());
    }
}
