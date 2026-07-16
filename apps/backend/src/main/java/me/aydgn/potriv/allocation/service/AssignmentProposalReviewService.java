package me.aydgn.potriv.allocation.service;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.allocation.dto.AssignmentProposalResponse.UserSummary;
import me.aydgn.potriv.allocation.dto.AssignmentReviewResponse;
import me.aydgn.potriv.allocation.dto.DepartmentProjectProposalResponse;
import me.aydgn.potriv.allocation.dto.ProjectAllocationResponse;
import me.aydgn.potriv.allocation.dto.ProjectProposalStatusFilter;
import me.aydgn.potriv.allocation.entity.ProjectAllocation;
import me.aydgn.potriv.allocation.entity.ProjectAssignmentProposal;
import me.aydgn.potriv.allocation.repository.ProjectAllocationRepository;
import me.aydgn.potriv.allocation.repository.ProjectAssignmentProposalRepository;
import me.aydgn.potriv.allocation.repository.ProjectDeallocationProposalRepository;
import me.aydgn.potriv.common.exception.ConflictException;
import me.aydgn.potriv.common.exception.ForbiddenException;
import me.aydgn.potriv.common.exception.NotFoundException;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.CurrentOrganizationResolver;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.organization.entity.Department;
import me.aydgn.potriv.organization.entity.DepartmentManagerAssignment;
import me.aydgn.potriv.organization.repository.DepartmentManagerAssignmentRepository;
import me.aydgn.potriv.project.entity.Project;

@Service
public class AssignmentProposalReviewService {

    private final ProjectAssignmentProposalRepository proposalRepository;
    private final ProjectDeallocationProposalRepository deallocationProposalRepository;
    private final ProjectAllocationRepository allocationRepository;
    private final DepartmentManagerAssignmentRepository managerAssignmentRepository;
    private final UserRepository userRepository;
    private final EmployeeCapacityService employeeCapacityService;
    private final CurrentOrganizationResolver currentOrganizationResolver;
    private final AssignmentProposalMapper mapper;
    private final DeallocationProposalMapper deallocationMapper;
    private final Clock clock;

    public AssignmentProposalReviewService(
        ProjectAssignmentProposalRepository proposalRepository,
        ProjectDeallocationProposalRepository deallocationProposalRepository,
        ProjectAllocationRepository allocationRepository,
        DepartmentManagerAssignmentRepository managerAssignmentRepository,
        UserRepository userRepository,
        EmployeeCapacityService employeeCapacityService,
        CurrentOrganizationResolver currentOrganizationResolver,
        AssignmentProposalMapper mapper,
        DeallocationProposalMapper deallocationMapper,
        Clock clock
    ) {
        this.proposalRepository = proposalRepository;
        this.deallocationProposalRepository = deallocationProposalRepository;
        this.allocationRepository = allocationRepository;
        this.managerAssignmentRepository = managerAssignmentRepository;
        this.userRepository = userRepository;
        this.employeeCapacityService = employeeCapacityService;
        this.currentOrganizationResolver = currentOrganizationResolver;
        this.mapper = mapper;
        this.deallocationMapper = deallocationMapper;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<DepartmentProjectProposalResponse> listForManagedDepartment(
        AuthenticatedUser currentUser,
        ProjectProposalStatusFilter statusFilter
    ) {
        currentOrganizationResolver.requireOrganizationId(currentUser);
        Department managedDepartment = requireManagedAssignment(currentUser).getDepartment();

        ProjectProposalStatusFilter status =
            statusFilter != null ? statusFilter : ProjectProposalStatusFilter.PENDING;

        // Combined queue: assignment and deallocation rows, oldest first, with a
        // stable tie-breaker on proposal type then ID.
        List<DepartmentProjectProposalResponse> combined = new ArrayList<>();
        combined.addAll(mapper.toDepartmentResponses(proposalRepository.findForReview(
            managedDepartment.getId(), status.toAssignmentStatus())));
        combined.addAll(deallocationMapper.toDepartmentResponses(
            deallocationProposalRepository.findForReview(
                managedDepartment.getId(), status.toDeallocationStatus())));
        combined.sort(Comparator
            .comparing(DepartmentProjectProposalResponse::createdAt)
            .thenComparing(DepartmentProjectProposalResponse::proposalType)
            .thenComparing(response -> response.proposalId().toString()));
        return combined;
    }

    @Transactional
    public AssignmentReviewResponse accept(AuthenticatedUser currentUser, UUID proposalId) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);
        DepartmentManagerAssignment assignment = requireManagedAssignment(currentUser);

        ProjectAssignmentProposal proposal =
            lockPendingProposalInDepartment(proposalId, assignment.getDepartment().getId());

        // Lock the employee row and re-verify tenant scope.
        User employee = userRepository.findByIdForUpdate(proposal.getEmployee().getId())
            .orElseThrow(() -> new NotFoundException("Proposal was not found."));
        requireSameOrganization(employee.getOrganization() == null
            ? null : employee.getOrganization().getId(), organizationId);
        Project project = proposal.getProject();
        requireSameOrganization(project.getOrganization().getId(), organizationId);

        if (allocationRepository.existsByProject_IdAndEmployee_IdAndDeallocatedAtIsNull(
            project.getId(), employee.getId())) {
            throw new ConflictException(
                "The employee already has an active allocation on this project.");
        }

        // Recalculate current capacity; if it no longer fits, keep the proposal
        // PENDING (the manager may still reject it later).
        int availableHours = employeeCapacityService.availableHours(employee.getId());
        if (proposal.getWorkHoursPerDay() > availableHours) {
            throw new ConflictException(
                "The employee no longer has enough available capacity for this proposal.");
        }

        OffsetDateTime now = OffsetDateTime.now(clock);
        User reviewedBy = assignment.getManager();

        ProjectAllocation allocation = allocationRepository.save(new ProjectAllocation(
            project, employee, proposal, proposal.getWorkHoursPerDay(), now));

        proposal.approve(reviewedBy, now);

        return new AssignmentReviewResponse(
            mapper.toResponse(proposal), toAllocationResponse(allocation, proposal));
    }

    @Transactional
    public AssignmentReviewResponse reject(AuthenticatedUser currentUser, UUID proposalId) {
        currentOrganizationResolver.requireOrganizationId(currentUser);
        DepartmentManagerAssignment assignment = requireManagedAssignment(currentUser);

        ProjectAssignmentProposal proposal =
            lockPendingProposalInDepartment(proposalId, assignment.getDepartment().getId());

        proposal.reject(assignment.getManager(), OffsetDateTime.now(clock));

        return new AssignmentReviewResponse(mapper.toResponse(proposal), null);
    }

    private ProjectAssignmentProposal lockPendingProposalInDepartment(
        UUID proposalId, UUID managedDepartmentId) {
        ProjectAssignmentProposal proposal = proposalRepository.findByIdForUpdate(proposalId)
            .filter(p -> p.getReviewDepartment().getId().equals(managedDepartmentId))
            .orElseThrow(() -> new NotFoundException("Proposal was not found."));

        if (!proposal.isPending()) {
            throw new ConflictException("This proposal has already been reviewed.");
        }
        return proposal;
    }

    private DepartmentManagerAssignment requireManagedAssignment(AuthenticatedUser currentUser) {
        // A DEPARTMENT_MANAGER role alone is not enough; an actual assignment is
        // required to review its department's proposals.
        return managerAssignmentRepository.findByManager_Id(currentUser.userId())
            .orElseThrow(() -> new ForbiddenException(
                "You are not assigned as a department manager."));
    }

    private void requireSameOrganization(UUID resourceOrganizationId, UUID organizationId) {
        if (resourceOrganizationId == null || !resourceOrganizationId.equals(organizationId)) {
            throw new NotFoundException("Proposal was not found.");
        }
    }

    private ProjectAllocationResponse toAllocationResponse(
        ProjectAllocation allocation, ProjectAssignmentProposal proposal) {
        User employee = allocation.getEmployee();
        return new ProjectAllocationResponse(
            allocation.getId(),
            allocation.getProject().getId(),
            new UserSummary(employee.getId(), employee.getName(), employee.getEmail()),
            proposal.getId(),
            allocation.getWorkHoursPerDay(),
            allocation.getAllocatedAt(),
            allocation.getDeallocatedAt(),
            proposal.getStatus());
    }
}
