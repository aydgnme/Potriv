package me.aydgn.potriv.project.detailsview;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.allocation.entity.ProjectAllocation;
import me.aydgn.potriv.allocation.entity.ProjectAssignmentProposalRole;
import me.aydgn.potriv.allocation.repository.ProjectAllocationRepository;
import me.aydgn.potriv.allocation.repository.ProjectAssignmentProposalRepository;
import me.aydgn.potriv.allocation.repository.ProjectAssignmentProposalRoleRepository;
import me.aydgn.potriv.allocation.repository.ProjectDeallocationProposalRepository;
import me.aydgn.potriv.common.exception.ForbiddenException;
import me.aydgn.potriv.common.exception.NotFoundException;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.CurrentOrganizationResolver;
import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.identity.repository.UserRoleRepository;
import me.aydgn.potriv.organization.entity.Department;
import me.aydgn.potriv.organization.entity.DepartmentManagerAssignment;
import me.aydgn.potriv.organization.repository.DepartmentManagerAssignmentRepository;
import me.aydgn.potriv.project.detailsview.dto.ProjectDetailsActiveMemberResponse;
import me.aydgn.potriv.project.detailsview.dto.ProjectDetailsDepartmentSummary;
import me.aydgn.potriv.project.detailsview.dto.ProjectDetailsPastMemberResponse;
import me.aydgn.potriv.project.detailsview.dto.ProjectDetailsResponse;
import me.aydgn.potriv.project.detailsview.dto.ProjectDetailsTeamRoleRequirementResponse;
import me.aydgn.potriv.project.detailsview.dto.ProjectDetailsTeamRoleSummary;
import me.aydgn.potriv.project.detailsview.dto.ProjectDetailsTechnologyResponse;
import me.aydgn.potriv.project.detailsview.dto.ProjectDetailsUserSummary;
import me.aydgn.potriv.project.entity.Project;
import me.aydgn.potriv.project.repository.ProjectRepository;
import me.aydgn.potriv.project.repository.ProjectTeamRoleRequirementRepository;
import me.aydgn.potriv.project.repository.ProjectTechnologyRepository;

/**
 * Read-only Project-09 detail view: the single-project page opened from the
 * managed, employee, department, and team list endpoints. Visibility requires
 * a legitimate project relationship — the owning Project Manager, an employee
 * with an (active or past) allocation, or a Department Manager whose managed
 * department was involved through proposal review-department snapshots. A
 * pending assignment proposal alone grants nothing; unrelated users get an
 * anti-leak 404. The payload carries the SRS detail fields only — no status
 * history, proposal queues, or deallocation audit data.
 */
@Service
public class ProjectDetailsService {

    private final ProjectRepository projectRepository;
    private final ProjectTechnologyRepository technologyRepository;
    private final ProjectTeamRoleRequirementRepository roleRequirementRepository;
    private final ProjectAllocationRepository allocationRepository;
    private final ProjectAssignmentProposalRepository assignmentProposalRepository;
    private final ProjectDeallocationProposalRepository deallocationProposalRepository;
    private final ProjectAssignmentProposalRoleRepository proposalRoleRepository;
    private final DepartmentManagerAssignmentRepository managerAssignmentRepository;
    private final UserRepository userRepository;
    private final UserRoleRepository userRoleRepository;
    private final CurrentOrganizationResolver currentOrganizationResolver;
    private final Clock clock;

    public ProjectDetailsService(
        ProjectRepository projectRepository,
        ProjectTechnologyRepository technologyRepository,
        ProjectTeamRoleRequirementRepository roleRequirementRepository,
        ProjectAllocationRepository allocationRepository,
        ProjectAssignmentProposalRepository assignmentProposalRepository,
        ProjectDeallocationProposalRepository deallocationProposalRepository,
        ProjectAssignmentProposalRoleRepository proposalRoleRepository,
        DepartmentManagerAssignmentRepository managerAssignmentRepository,
        UserRepository userRepository,
        UserRoleRepository userRoleRepository,
        CurrentOrganizationResolver currentOrganizationResolver,
        Clock clock
    ) {
        this.projectRepository = projectRepository;
        this.technologyRepository = technologyRepository;
        this.roleRequirementRepository = roleRequirementRepository;
        this.allocationRepository = allocationRepository;
        this.assignmentProposalRepository = assignmentProposalRepository;
        this.deallocationProposalRepository = deallocationProposalRepository;
        this.proposalRoleRepository = proposalRoleRepository;
        this.managerAssignmentRepository = managerAssignmentRepository;
        this.userRepository = userRepository;
        this.userRoleRepository = userRoleRepository;
        this.currentOrganizationResolver = currentOrganizationResolver;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public ProjectDetailsResponse getProjectDetails(
        AuthenticatedUser currentUser,
        UUID projectId
    ) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);

        Project project = projectRepository.findByIdAndOrganization_Id(projectId, organizationId)
            .orElseThrow(ProjectDetailsService::projectNotFound);

        requireViewerRelationship(project, currentUser, organizationId);

        List<ProjectAllocation> activeAllocations =
            allocationRepository.findActiveByProjectIdWithDetails(projectId);
        List<ProjectAllocation> pastAllocations =
            allocationRepository.findPastByProjectIdWithDetails(projectId);

        // One batch role query for all allocations' proposals.
        Set<UUID> proposalIds = new HashSet<>();
        activeAllocations.forEach(
            allocation -> proposalIds.add(allocation.getAssignmentProposal().getId()));
        pastAllocations.forEach(
            allocation -> proposalIds.add(allocation.getAssignmentProposal().getId()));
        Map<UUID, List<ProjectDetailsTeamRoleSummary>> rolesByProposal = loadRoles(proposalIds);

        return new ProjectDetailsResponse(
            project.getId(),
            project.getName(),
            project.getStatus(),
            project.getPeriod(),
            project.getStartDate(),
            project.getDeadlineDate(),
            project.getGeneralDescription(),
            userSummary(project.getProjectManager()),
            mapTechnologies(projectId),
            mapRoleRequirements(projectId),
            mapActiveMembers(activeAllocations, rolesByProposal),
            mapPastMembers(pastAllocations, rolesByProposal),
            OffsetDateTime.now(clock));
    }

    // ---- visibility ----

    private void requireViewerRelationship(
        Project project, AuthenticatedUser currentUser, UUID organizationId) {
        if (isOwningProjectManager(project, currentUser)) {
            return;
        }
        if (isProjectEmployee(project.getId(), currentUser.userId())) {
            return;
        }
        if (isInvolvedDepartmentManager(project.getId(), currentUser.userId(), organizationId)) {
            return;
        }
        // Anti-leak: an unrelated same-organization user learns nothing.
        throw projectNotFound();
    }

    private boolean isOwningProjectManager(Project project, AuthenticatedUser currentUser) {
        return project.getProjectManager().getId().equals(currentUser.userId());
    }

    private boolean isProjectEmployee(UUID projectId, UUID userId) {
        // Any allocation episode counts — a deallocated employee keeps visibility.
        // A pending proposal alone grants nothing.
        return allocationRepository.existsByProject_IdAndEmployee_Id(projectId, userId);
    }

    private boolean isInvolvedDepartmentManager(
        UUID projectId, UUID userId, UUID organizationId) {
        Optional<DepartmentManagerAssignment> assignment =
            managerAssignmentRepository.findByManager_Id(userId);

        if (assignment.isEmpty()) {
            // A DEPARTMENT_MANAGER role holder without an actual assignment gets
            // the controlled forbidden used elsewhere; anyone else stays 404.
            User user = userRepository.findById(userId)
                .orElseThrow(ProjectDetailsService::projectNotFound);
            if (userRoleRepository.existsByUserAndRole(user, AccessRole.DEPARTMENT_MANAGER)) {
                throw new ForbiddenException("You are not assigned as a department manager.");
            }
            return false;
        }

        Department department = assignment.get().getDepartment();
        if (!department.getOrganization().getId().equals(organizationId)) {
            throw new ForbiddenException(
                "Your managed department does not belong to the current organization.");
        }

        // Involvement through review-department snapshots: any assignment proposal
        // of this project (covers pending/approved/rejected and thereby all
        // allocations), or any deallocation proposal of this project's allocations
        // (the employee may have moved departments between assignment and
        // deallocation).
        return assignmentProposalRepository.existsByProject_IdAndReviewDepartment_Id(
                projectId, department.getId())
            || deallocationProposalRepository.existsByAllocation_Project_IdAndReviewDepartment_Id(
                projectId, department.getId());
    }

    // ---- batch loading ----

    private Map<UUID, List<ProjectDetailsTeamRoleSummary>> loadRoles(
        Collection<UUID> proposalIds) {
        if (proposalIds.isEmpty()) {
            return Map.of();
        }
        return proposalRoleRepository.findByProposalIdsWithTeamRole(proposalIds).stream()
            .collect(Collectors.groupingBy(
                role -> role.getProposal().getId(),
                Collectors.mapping(ProjectDetailsService::roleSummary, Collectors.toList())));
    }

    // ---- mapping ----

    private List<ProjectDetailsTechnologyResponse> mapTechnologies(UUID projectId) {
        return technologyRepository.findByProject_IdOrderByNameAsc(projectId).stream()
            .map(technology -> new ProjectDetailsTechnologyResponse(
                technology.getId(), technology.getName()))
            .sorted(Comparator
                .comparing((ProjectDetailsTechnologyResponse technology) ->
                    technology.name().toLowerCase(Locale.ROOT))
                .thenComparing(technology -> technology.technologyId().toString()))
            .toList();
    }

    private List<ProjectDetailsTeamRoleRequirementResponse> mapRoleRequirements(UUID projectId) {
        return roleRequirementRepository.findByProjectIdWithTeamRole(projectId).stream()
            .map(requirement -> new ProjectDetailsTeamRoleRequirementResponse(
                requirement.getId(),
                roleSummaryOf(requirement.getTeamRole().getId(),
                    requirement.getTeamRole().getName(),
                    requirement.getTeamRole().isActive()),
                requirement.getRequiredMembers()))
            .sorted(Comparator
                .comparing((ProjectDetailsTeamRoleRequirementResponse requirement) ->
                    requirement.teamRole().name().toLowerCase(Locale.ROOT))
                .thenComparing(requirement -> requirement.requirementId().toString()))
            .toList();
    }

    private List<ProjectDetailsActiveMemberResponse> mapActiveMembers(
        List<ProjectAllocation> activeAllocations,
        Map<UUID, List<ProjectDetailsTeamRoleSummary>> rolesByProposal) {
        return activeAllocations.stream()
            .map(allocation -> new ProjectDetailsActiveMemberResponse(
                allocation.getId(),
                allocation.getAssignmentProposal().getId(),
                userSummary(allocation.getEmployee()),
                departmentSummary(allocation.getAssignmentProposal().getReviewDepartment()),
                allocation.getWorkHoursPerDay(),
                sortedRoles(rolesByProposal, allocation),
                allocation.getAllocatedAt()))
            .sorted(Comparator
                .comparing((ProjectDetailsActiveMemberResponse member) ->
                    member.employee().name().toLowerCase(Locale.ROOT))
                .thenComparing(ProjectDetailsActiveMemberResponse::allocatedAt)
                .thenComparing(member -> member.allocationId().toString()))
            .toList();
    }

    private List<ProjectDetailsPastMemberResponse> mapPastMembers(
        List<ProjectAllocation> pastAllocations,
        Map<UUID, List<ProjectDetailsTeamRoleSummary>> rolesByProposal) {
        return pastAllocations.stream()
            .map(allocation -> new ProjectDetailsPastMemberResponse(
                allocation.getId(),
                allocation.getAssignmentProposal().getId(),
                userSummary(allocation.getEmployee()),
                departmentSummary(allocation.getAssignmentProposal().getReviewDepartment()),
                allocation.getWorkHoursPerDay(),
                sortedRoles(rolesByProposal, allocation),
                allocation.getAllocatedAt(),
                allocation.getDeallocatedAt()))
            .sorted(Comparator
                .comparing(ProjectDetailsPastMemberResponse::deallocatedAt,
                    Comparator.reverseOrder())
                .thenComparing(member -> member.employee().name().toLowerCase(Locale.ROOT))
                .thenComparing(member -> member.allocationId().toString()))
            .toList();
    }

    private static List<ProjectDetailsTeamRoleSummary> sortedRoles(
        Map<UUID, List<ProjectDetailsTeamRoleSummary>> rolesByProposal,
        ProjectAllocation allocation) {
        return rolesByProposal
            .getOrDefault(allocation.getAssignmentProposal().getId(), List.of()).stream()
            .sorted(Comparator
                .comparing((ProjectDetailsTeamRoleSummary role) ->
                    role.name().toLowerCase(Locale.ROOT))
                .thenComparing(role -> role.teamRoleId().toString()))
            .toList();
    }

    private static ProjectDetailsTeamRoleSummary roleSummary(ProjectAssignmentProposalRole role) {
        return roleSummaryOf(role.getTeamRole().getId(), role.getTeamRole().getName(),
            role.getTeamRole().isActive());
    }

    private static ProjectDetailsTeamRoleSummary roleSummaryOf(
        UUID teamRoleId, String name, boolean active) {
        return new ProjectDetailsTeamRoleSummary(teamRoleId, name, active);
    }

    private static ProjectDetailsUserSummary userSummary(User user) {
        return new ProjectDetailsUserSummary(user.getId(), user.getName(), user.getEmail());
    }

    private static ProjectDetailsDepartmentSummary departmentSummary(Department department) {
        return new ProjectDetailsDepartmentSummary(department.getId(), department.getName());
    }

    private static NotFoundException projectNotFound() {
        return new NotFoundException("Project was not found.");
    }
}
