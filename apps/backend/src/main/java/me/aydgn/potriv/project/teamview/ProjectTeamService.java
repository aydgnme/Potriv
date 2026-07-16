package me.aydgn.potriv.project.teamview;

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
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.allocation.entity.AssignmentProposalStatus;
import me.aydgn.potriv.allocation.entity.DeallocationProposalStatus;
import me.aydgn.potriv.allocation.entity.ProjectAllocation;
import me.aydgn.potriv.allocation.entity.ProjectAssignmentProposal;
import me.aydgn.potriv.allocation.entity.ProjectAssignmentProposalRole;
import me.aydgn.potriv.allocation.entity.ProjectDeallocationProposal;
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
import me.aydgn.potriv.project.entity.Project;
import me.aydgn.potriv.project.repository.ProjectRepository;
import me.aydgn.potriv.project.teamview.dto.ProjectActiveMemberResponse;
import me.aydgn.potriv.project.teamview.dto.ProjectPastMemberResponse;
import me.aydgn.potriv.project.teamview.dto.ProjectProposedMemberResponse;
import me.aydgn.potriv.project.teamview.dto.ProjectTeamDepartmentSummary;
import me.aydgn.potriv.project.teamview.dto.ProjectTeamResponse;
import me.aydgn.potriv.project.teamview.dto.ProjectTeamRoleSummary;
import me.aydgn.potriv.project.teamview.dto.ProjectTeamUserSummary;

/**
 * Read-only Project-06 team view. Team membership is derived from the real
 * allocation workflow: pending assignment proposals are proposed members,
 * active allocations are active members, and deallocated allocations are past
 * members. Visibility requires a legitimate project relationship — the owning
 * Project Manager, an employee with an (active or past) allocation, or a
 * Department Manager whose managed department was involved in the project's
 * proposal/allocation flow.
 */
@Service
public class ProjectTeamService {

    private final ProjectRepository projectRepository;
    private final ProjectAssignmentProposalRepository assignmentProposalRepository;
    private final ProjectAllocationRepository allocationRepository;
    private final ProjectDeallocationProposalRepository deallocationProposalRepository;
    private final ProjectAssignmentProposalRoleRepository proposalRoleRepository;
    private final DepartmentManagerAssignmentRepository managerAssignmentRepository;
    private final UserRepository userRepository;
    private final UserRoleRepository userRoleRepository;
    private final CurrentOrganizationResolver currentOrganizationResolver;
    private final Clock clock;

    public ProjectTeamService(
        ProjectRepository projectRepository,
        ProjectAssignmentProposalRepository assignmentProposalRepository,
        ProjectAllocationRepository allocationRepository,
        ProjectDeallocationProposalRepository deallocationProposalRepository,
        ProjectAssignmentProposalRoleRepository proposalRoleRepository,
        DepartmentManagerAssignmentRepository managerAssignmentRepository,
        UserRepository userRepository,
        UserRoleRepository userRoleRepository,
        CurrentOrganizationResolver currentOrganizationResolver,
        Clock clock
    ) {
        this.projectRepository = projectRepository;
        this.assignmentProposalRepository = assignmentProposalRepository;
        this.allocationRepository = allocationRepository;
        this.deallocationProposalRepository = deallocationProposalRepository;
        this.proposalRoleRepository = proposalRoleRepository;
        this.managerAssignmentRepository = managerAssignmentRepository;
        this.userRepository = userRepository;
        this.userRoleRepository = userRoleRepository;
        this.currentOrganizationResolver = currentOrganizationResolver;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public ProjectTeamResponse getProjectTeam(AuthenticatedUser currentUser, UUID projectId) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);

        Project project = projectRepository.findByIdAndOrganization_Id(projectId, organizationId)
            .orElseThrow(ProjectTeamService::projectNotFound);

        requireViewerRelationship(project, currentUser, organizationId);

        List<ProjectAssignmentProposal> pendingProposals = assignmentProposalRepository
            .findByProjectIdAndStatusWithDetails(projectId, AssignmentProposalStatus.PENDING);
        List<ProjectAllocation> activeAllocations =
            allocationRepository.findActiveByProjectIdWithDetails(projectId);
        List<ProjectAllocation> pastAllocations =
            allocationRepository.findPastByProjectIdWithDetails(projectId);

        // One batch role query for pending proposals and all allocations' proposals.
        Set<UUID> proposalIds = new HashSet<>();
        pendingProposals.forEach(proposal -> proposalIds.add(proposal.getId()));
        activeAllocations.forEach(
            allocation -> proposalIds.add(allocation.getAssignmentProposal().getId()));
        pastAllocations.forEach(
            allocation -> proposalIds.add(allocation.getAssignmentProposal().getId()));
        Map<UUID, List<ProjectTeamRoleSummary>> rolesByProposal = loadRoles(proposalIds);

        // One batch query for the approved deallocation proposals of past members.
        Map<UUID, ProjectDeallocationProposal> deallocationByAllocation =
            loadApprovedDeallocations(pastAllocations);

        return new ProjectTeamResponse(
            project.getId(),
            project.getName(),
            project.getStatus(),
            project.getPeriod(),
            project.getStartDate(),
            project.getDeadlineDate(),
            mapProposedMembers(pendingProposals, rolesByProposal),
            mapActiveMembers(activeAllocations, rolesByProposal),
            mapPastMembers(pastAllocations, rolesByProposal, deallocationByAllocation),
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
                .orElseThrow(ProjectTeamService::projectNotFound);
            if (userRoleRepository.existsByUserAndRole(user, AccessRole.DEPARTMENT_MANAGER)) {
                throw new ForbiddenException("You are not assigned as a department manager.");
            }
            return false;
        }

        Department department = assignment.get().getDepartment();
        if (!department.getOrganization().getId().equals(organizationId)) {
            return false;
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

    private Map<UUID, List<ProjectTeamRoleSummary>> loadRoles(Collection<UUID> proposalIds) {
        if (proposalIds.isEmpty()) {
            return Map.of();
        }
        return proposalRoleRepository.findByProposalIdsWithTeamRole(proposalIds).stream()
            .collect(Collectors.groupingBy(
                role -> role.getProposal().getId(),
                Collectors.mapping(ProjectTeamService::roleSummary, Collectors.toList())));
    }

    private Map<UUID, ProjectDeallocationProposal> loadApprovedDeallocations(
        List<ProjectAllocation> pastAllocations) {
        if (pastAllocations.isEmpty()) {
            return Map.of();
        }
        List<UUID> allocationIds =
            pastAllocations.stream().map(ProjectAllocation::getId).toList();
        // If several approved proposals unexpectedly exist for one allocation,
        // pick deterministically: latest reviewedAt, then latest createdAt, then
        // lowest UUID.
        Comparator<ProjectDeallocationProposal> preference = Comparator
            .comparing(ProjectDeallocationProposal::getReviewedAt,
                Comparator.nullsFirst(Comparator.naturalOrder()))
            .thenComparing(ProjectDeallocationProposal::getCreatedAt)
            .reversed()
            .thenComparing(proposal -> proposal.getId().toString());
        return deallocationProposalRepository
            .findByAllocationIdsAndStatusWithDetails(
                allocationIds, DeallocationProposalStatus.APPROVED).stream()
            .collect(Collectors.toMap(
                proposal -> proposal.getAllocation().getId(),
                Function.identity(),
                (first, second) -> preference.compare(first, second) <= 0 ? first : second));
    }

    // ---- mapping ----

    private List<ProjectProposedMemberResponse> mapProposedMembers(
        List<ProjectAssignmentProposal> pendingProposals,
        Map<UUID, List<ProjectTeamRoleSummary>> rolesByProposal) {
        return pendingProposals.stream()
            .map(proposal -> new ProjectProposedMemberResponse(
                proposal.getId(),
                userSummary(proposal.getEmployee()),
                departmentSummary(proposal.getReviewDepartment()),
                proposal.getWorkHoursPerDay(),
                rolesByProposal.getOrDefault(proposal.getId(), List.of()),
                proposal.getComments(),
                userSummary(proposal.getProposedBy()),
                proposal.getCreatedAt()))
            .sorted(Comparator
                .comparing(ProjectProposedMemberResponse::proposedAt)
                .thenComparing(member -> member.employee().name().toLowerCase(Locale.ROOT))
                .thenComparing(member -> member.proposalId().toString()))
            .toList();
    }

    private List<ProjectActiveMemberResponse> mapActiveMembers(
        List<ProjectAllocation> activeAllocations,
        Map<UUID, List<ProjectTeamRoleSummary>> rolesByProposal) {
        return activeAllocations.stream()
            .map(allocation -> {
                ProjectAssignmentProposal proposal = allocation.getAssignmentProposal();
                return new ProjectActiveMemberResponse(
                    allocation.getId(),
                    proposal.getId(),
                    userSummary(allocation.getEmployee()),
                    departmentSummary(proposal.getReviewDepartment()),
                    allocation.getWorkHoursPerDay(),
                    rolesByProposal.getOrDefault(proposal.getId(), List.of()),
                    allocation.getAllocatedAt(),
                    userSummary(proposal.getProposedBy()),
                    userSummary(proposal.getReviewedBy()),
                    proposal.getReviewedAt());
            })
            .sorted(Comparator
                .comparing((ProjectActiveMemberResponse member) ->
                    member.employee().name().toLowerCase(Locale.ROOT))
                .thenComparing(ProjectActiveMemberResponse::allocatedAt)
                .thenComparing(member -> member.allocationId().toString()))
            .toList();
    }

    private List<ProjectPastMemberResponse> mapPastMembers(
        List<ProjectAllocation> pastAllocations,
        Map<UUID, List<ProjectTeamRoleSummary>> rolesByProposal,
        Map<UUID, ProjectDeallocationProposal> deallocationByAllocation) {
        return pastAllocations.stream()
            .map(allocation -> {
                ProjectAssignmentProposal proposal = allocation.getAssignmentProposal();
                ProjectDeallocationProposal deallocation =
                    deallocationByAllocation.get(allocation.getId());
                return new ProjectPastMemberResponse(
                    allocation.getId(),
                    proposal.getId(),
                    userSummary(allocation.getEmployee()),
                    departmentSummary(proposal.getReviewDepartment()),
                    allocation.getWorkHoursPerDay(),
                    rolesByProposal.getOrDefault(proposal.getId(), List.of()),
                    allocation.getAllocatedAt(),
                    allocation.getDeallocatedAt(),
                    deallocation == null ? null : deallocation.getId(),
                    deallocation == null ? null : deallocation.getReason(),
                    deallocation == null ? null : userSummary(deallocation.getProposedBy()),
                    deallocation == null ? null : userSummary(deallocation.getReviewedBy()),
                    deallocation == null ? null : deallocation.getReviewedAt());
            })
            .sorted(Comparator
                .comparing(ProjectPastMemberResponse::deallocatedAt, Comparator.reverseOrder())
                .thenComparing(member -> member.employee().name().toLowerCase(Locale.ROOT))
                .thenComparing(member -> member.allocationId().toString()))
            .toList();
    }

    // ---- summaries ----

    private static ProjectTeamUserSummary userSummary(User user) {
        if (user == null) {
            return null;
        }
        return new ProjectTeamUserSummary(user.getId(), user.getName(), user.getEmail());
    }

    private static ProjectTeamDepartmentSummary departmentSummary(Department department) {
        return new ProjectTeamDepartmentSummary(department.getId(), department.getName());
    }

    private static ProjectTeamRoleSummary roleSummary(ProjectAssignmentProposalRole role) {
        return new ProjectTeamRoleSummary(
            role.getTeamRole().getId(), role.getTeamRole().getName(), role.getTeamRole().isActive());
    }

    private static NotFoundException projectNotFound() {
        return new NotFoundException("Project was not found.");
    }
}
