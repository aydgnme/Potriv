package me.aydgn.potriv.project.employeeview;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.HashSet;
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
import me.aydgn.potriv.common.exception.NotFoundException;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.CurrentOrganizationResolver;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.project.employeeview.dto.EmployeeProjectItemResponse;
import me.aydgn.potriv.project.employeeview.dto.EmployeeProjectRoleSummary;
import me.aydgn.potriv.project.employeeview.dto.EmployeeProjectTechnologySummary;
import me.aydgn.potriv.project.employeeview.dto.EmployeeProjectsResponse;
import me.aydgn.potriv.project.entity.Project;
import me.aydgn.potriv.project.repository.ProjectTechnologyRepository;

/**
 * Read-only Project-07 self-service view: the authenticated user's allocation
 * episodes split into current (active allocations) and past (deallocated
 * allocations). The current/past split comes solely from {@code deallocatedAt},
 * never from the project status. Roles come from the approved assignment
 * proposal role snapshot; the technology stack comes from the project's
 * technologies.
 */
@Service
public class EmployeeProjectService {

    private final ProjectAllocationRepository allocationRepository;
    private final ProjectAssignmentProposalRoleRepository proposalRoleRepository;
    private final ProjectTechnologyRepository technologyRepository;
    private final UserRepository userRepository;
    private final CurrentOrganizationResolver currentOrganizationResolver;
    private final Clock clock;

    public EmployeeProjectService(
        ProjectAllocationRepository allocationRepository,
        ProjectAssignmentProposalRoleRepository proposalRoleRepository,
        ProjectTechnologyRepository technologyRepository,
        UserRepository userRepository,
        CurrentOrganizationResolver currentOrganizationResolver,
        Clock clock
    ) {
        this.allocationRepository = allocationRepository;
        this.proposalRoleRepository = proposalRoleRepository;
        this.technologyRepository = technologyRepository;
        this.userRepository = userRepository;
        this.currentOrganizationResolver = currentOrganizationResolver;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public EmployeeProjectsResponse getMyProjects(AuthenticatedUser currentUser) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);
        UUID userId = currentUser.userId();

        User user = userRepository.findById(userId)
            .orElseThrow(() -> new NotFoundException("Authenticated user was not found."));

        List<ProjectAllocation> currentAllocations = allocationRepository
            .findCurrentByEmployeeIdAndOrganizationIdWithDetails(userId, organizationId);
        List<ProjectAllocation> pastAllocations = allocationRepository
            .findPastByEmployeeIdAndOrganizationIdWithDetails(userId, organizationId);

        // One batch query each for role snapshots and project technologies.
        Set<UUID> proposalIds = new HashSet<>();
        Set<UUID> projectIds = new HashSet<>();
        for (ProjectAllocation allocation : currentAllocations) {
            proposalIds.add(allocation.getAssignmentProposal().getId());
            projectIds.add(allocation.getProject().getId());
        }
        for (ProjectAllocation allocation : pastAllocations) {
            proposalIds.add(allocation.getAssignmentProposal().getId());
            projectIds.add(allocation.getProject().getId());
        }

        Map<UUID, List<EmployeeProjectRoleSummary>> rolesByProposal = proposalIds.isEmpty()
            ? Map.of()
            : proposalRoleRepository.findByProposalIdsWithTeamRole(proposalIds).stream()
                .collect(Collectors.groupingBy(
                    role -> role.getProposal().getId(),
                    Collectors.mapping(EmployeeProjectService::roleSummary, Collectors.toList())));

        Map<UUID, List<EmployeeProjectTechnologySummary>> technologiesByProject =
            projectIds.isEmpty()
                ? Map.of()
                : technologyRepository.findByProjectIds(projectIds).stream()
                    .collect(Collectors.groupingBy(
                        technology -> technology.getProject().getId(),
                        Collectors.mapping(
                            technology -> new EmployeeProjectTechnologySummary(
                                technology.getId(), technology.getName()),
                            Collectors.toList())));

        List<EmployeeProjectItemResponse> currentProjects =
            mapItems(currentAllocations, rolesByProposal, technologiesByProject).stream()
                .sorted(Comparator
                    .comparing(EmployeeProjectItemResponse::allocatedAt, Comparator.reverseOrder())
                    .thenComparing(item -> item.projectName().toLowerCase(Locale.ROOT))
                    .thenComparing(item -> item.allocationId().toString()))
                .toList();

        List<EmployeeProjectItemResponse> pastProjects =
            mapItems(pastAllocations, rolesByProposal, technologiesByProject).stream()
                .sorted(Comparator
                    .comparing(EmployeeProjectItemResponse::deallocatedAt, Comparator.reverseOrder())
                    .thenComparing(item -> item.projectName().toLowerCase(Locale.ROOT))
                    .thenComparing(item -> item.allocationId().toString()))
                .toList();

        return new EmployeeProjectsResponse(
            user.getId(),
            user.getName(),
            user.getEmail(),
            currentProjects,
            pastProjects,
            OffsetDateTime.now(clock));
    }

    private List<EmployeeProjectItemResponse> mapItems(
        List<ProjectAllocation> allocations,
        Map<UUID, List<EmployeeProjectRoleSummary>> rolesByProposal,
        Map<UUID, List<EmployeeProjectTechnologySummary>> technologiesByProject
    ) {
        return allocations.stream()
            .map(allocation -> {
                Project project = allocation.getProject();
                List<EmployeeProjectRoleSummary> roles = rolesByProposal
                    .getOrDefault(allocation.getAssignmentProposal().getId(), List.of()).stream()
                    .sorted(Comparator
                        .comparing((EmployeeProjectRoleSummary role) ->
                            role.name().toLowerCase(Locale.ROOT))
                        .thenComparing(role -> role.teamRoleId().toString()))
                    .toList();
                List<EmployeeProjectTechnologySummary> technologies = technologiesByProject
                    .getOrDefault(project.getId(), List.of()).stream()
                    .sorted(Comparator
                        .comparing((EmployeeProjectTechnologySummary technology) ->
                            technology.name().toLowerCase(Locale.ROOT))
                        .thenComparing(technology -> technology.technologyId().toString()))
                    .toList();
                return new EmployeeProjectItemResponse(
                    project.getId(),
                    project.getName(),
                    project.getStatus(),
                    project.getPeriod(),
                    project.getStartDate(),
                    project.getDeadlineDate(),
                    allocation.getId(),
                    allocation.getWorkHoursPerDay(),
                    roles,
                    technologies,
                    allocation.getAllocatedAt(),
                    allocation.getDeallocatedAt());
            })
            .toList();
    }

    private static EmployeeProjectRoleSummary roleSummary(ProjectAssignmentProposalRole role) {
        return new EmployeeProjectRoleSummary(
            role.getTeamRole().getId(), role.getTeamRole().getName(), role.getTeamRole().isActive());
    }
}
