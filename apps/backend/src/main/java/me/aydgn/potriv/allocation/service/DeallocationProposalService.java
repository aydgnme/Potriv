package me.aydgn.potriv.allocation.service;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.allocation.dto.CreateDeallocationProposalRequest;
import me.aydgn.potriv.allocation.dto.DeallocationProposalResponse;
import me.aydgn.potriv.allocation.dto.DeallocationReviewResponse;
import me.aydgn.potriv.allocation.entity.DeallocationProposalStatus;
import me.aydgn.potriv.allocation.entity.ProjectAllocation;
import me.aydgn.potriv.allocation.entity.ProjectDeallocationProposal;
import me.aydgn.potriv.allocation.repository.ProjectAllocationRepository;
import me.aydgn.potriv.allocation.repository.ProjectDeallocationProposalRepository;
import me.aydgn.potriv.common.exception.ConflictException;
import me.aydgn.potriv.common.exception.ForbiddenException;
import me.aydgn.potriv.common.exception.NotFoundException;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.CurrentOrganizationResolver;
import me.aydgn.potriv.organization.entity.Department;
import me.aydgn.potriv.organization.entity.DepartmentManagerAssignment;
import me.aydgn.potriv.organization.repository.DepartmentManagerAssignmentRepository;
import me.aydgn.potriv.organization.repository.DepartmentMembershipRepository;
import me.aydgn.potriv.project.entity.Project;
import me.aydgn.potriv.project.service.ProjectService;

@Service
public class DeallocationProposalService {

    private final ProjectService projectService;
    private final ProjectAllocationRepository allocationRepository;
    private final ProjectDeallocationProposalRepository proposalRepository;
    private final DepartmentMembershipRepository departmentMembershipRepository;
    private final DepartmentManagerAssignmentRepository managerAssignmentRepository;
    private final CurrentOrganizationResolver currentOrganizationResolver;
    private final DeallocationProposalMapper mapper;
    private final Clock clock;

    public DeallocationProposalService(
        ProjectService projectService,
        ProjectAllocationRepository allocationRepository,
        ProjectDeallocationProposalRepository proposalRepository,
        DepartmentMembershipRepository departmentMembershipRepository,
        DepartmentManagerAssignmentRepository managerAssignmentRepository,
        CurrentOrganizationResolver currentOrganizationResolver,
        DeallocationProposalMapper mapper,
        Clock clock
    ) {
        this.projectService = projectService;
        this.allocationRepository = allocationRepository;
        this.proposalRepository = proposalRepository;
        this.departmentMembershipRepository = departmentMembershipRepository;
        this.managerAssignmentRepository = managerAssignmentRepository;
        this.currentOrganizationResolver = currentOrganizationResolver;
        this.mapper = mapper;
        this.clock = clock;
    }

    @Transactional
    public DeallocationProposalResponse create(
        AuthenticatedUser currentUser,
        UUID projectId,
        UUID allocationId,
        CreateDeallocationProposalRequest request
    ) {
        currentOrganizationResolver.requireOrganizationId(currentUser);

        // Owner-scoped project resolution (cross-org / non-owner -> 404).
        Project project = projectService.requireManagedProject(currentUser, projectId);

        // Lock the allocation row for the rest of the transaction; it must
        // belong to the resolved project (anti-leak 404 otherwise).
        ProjectAllocation allocation = allocationRepository.findByIdForUpdate(allocationId)
            .filter(a -> a.getProject().getId().equals(project.getId()))
            .orElseThrow(() -> new NotFoundException("Allocation was not found."));

        if (!allocation.isActive()) {
            throw new ConflictException("This allocation has already been deallocated.");
        }

        // Review department is a snapshot of the employee's current membership.
        Department reviewDepartment = departmentMembershipRepository
            .findByMember_Id(allocation.getEmployee().getId())
            .map(membership -> membership.getDepartment())
            .orElseThrow(() -> new ConflictException(
                "The employee has no department membership and cannot be reviewed."));

        if (proposalRepository.existsByAllocation_IdAndStatus(
            allocation.getId(), DeallocationProposalStatus.PENDING)) {
            throw new ConflictException(
                "A pending deallocation proposal already exists for this allocation.");
        }

        ProjectDeallocationProposal proposal = proposalRepository.save(
            new ProjectDeallocationProposal(
                allocation,
                reviewDepartment,
                request.reason().trim(),
                DeallocationProposalStatus.PENDING,
                project.getProjectManager()));

        return mapper.toResponse(proposal);
    }

    @Transactional
    public DeallocationReviewResponse accept(AuthenticatedUser currentUser, UUID proposalId) {
        currentOrganizationResolver.requireOrganizationId(currentUser);
        DepartmentManagerAssignment assignment = requireManagedAssignment(currentUser);

        ProjectDeallocationProposal proposal =
            lockPendingProposalInDepartment(proposalId, assignment.getDepartment().getId());

        // Lock the allocation; it must still be active to be deallocated. If it
        // was already ended elsewhere, the proposal intentionally stays PENDING.
        ProjectAllocation allocation = allocationRepository
            .findByIdForUpdate(proposal.getAllocation().getId())
            .orElseThrow(() -> new NotFoundException("Proposal was not found."));
        if (!allocation.isActive()) {
            throw new ConflictException("This allocation has already been deallocated.");
        }

        OffsetDateTime now = OffsetDateTime.now(clock);
        allocation.deallocate(now);
        proposal.approve(assignment.getManager(), now);

        return new DeallocationReviewResponse(
            mapper.toResponse(proposal), mapper.toAllocationResponse(allocation));
    }

    @Transactional
    public DeallocationReviewResponse reject(AuthenticatedUser currentUser, UUID proposalId) {
        currentOrganizationResolver.requireOrganizationId(currentUser);
        DepartmentManagerAssignment assignment = requireManagedAssignment(currentUser);

        ProjectDeallocationProposal proposal =
            lockPendingProposalInDepartment(proposalId, assignment.getDepartment().getId());

        // The allocation remains active; only the proposal records the decision.
        proposal.reject(assignment.getManager(), OffsetDateTime.now(clock));

        return new DeallocationReviewResponse(
            mapper.toResponse(proposal), mapper.toAllocationResponse(proposal.getAllocation()));
    }

    private ProjectDeallocationProposal lockPendingProposalInDepartment(
        UUID proposalId, UUID managedDepartmentId) {
        ProjectDeallocationProposal proposal = proposalRepository.findByIdForUpdate(proposalId)
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
}
