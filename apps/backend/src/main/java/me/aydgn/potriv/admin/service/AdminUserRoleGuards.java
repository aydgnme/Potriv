package me.aydgn.potriv.admin.service;

import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Component;

import me.aydgn.potriv.allocation.repository.ProjectAllocationRepository;
import me.aydgn.potriv.allocation.repository.ProjectAssignmentProposalRepository;
import me.aydgn.potriv.allocation.repository.ProjectDeallocationProposalRepository;
import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.organization.repository.DepartmentManagerAssignmentRepository;
import me.aydgn.potriv.organization.repository.DepartmentMembershipRepository;
import me.aydgn.potriv.project.entity.ProjectStatus;
import me.aydgn.potriv.project.repository.ProjectRepository;
import me.aydgn.potriv.skill.repository.EmployeeSkillRepository;

/**
 * Read-only domain guards that decide whether revoking a role from a user is
 * safe. Shared by the role-management page (to show why revoke is disabled) and
 * the write service (to block the actual revoke). A blocked reason is returned;
 * an empty result means the revoke is safe.
 */
@Component
public class AdminUserRoleGuards {

    private final DepartmentManagerAssignmentRepository managerAssignmentRepository;
    private final DepartmentMembershipRepository membershipRepository;
    private final EmployeeSkillRepository employeeSkillRepository;
    private final ProjectAllocationRepository allocationRepository;
    private final ProjectAssignmentProposalRepository assignmentProposalRepository;
    private final ProjectDeallocationProposalRepository deallocationProposalRepository;
    private final ProjectRepository projectRepository;

    public AdminUserRoleGuards(
        DepartmentManagerAssignmentRepository managerAssignmentRepository,
        DepartmentMembershipRepository membershipRepository,
        EmployeeSkillRepository employeeSkillRepository,
        ProjectAllocationRepository allocationRepository,
        ProjectAssignmentProposalRepository assignmentProposalRepository,
        ProjectDeallocationProposalRepository deallocationProposalRepository,
        ProjectRepository projectRepository
    ) {
        this.managerAssignmentRepository = managerAssignmentRepository;
        this.membershipRepository = membershipRepository;
        this.employeeSkillRepository = employeeSkillRepository;
        this.allocationRepository = allocationRepository;
        this.assignmentProposalRepository = assignmentProposalRepository;
        this.deallocationProposalRepository = deallocationProposalRepository;
        this.projectRepository = projectRepository;
    }

    /** The reason a role revoke is blocked for this user, or empty when safe. */
    public Optional<String> revokeBlockReason(UUID userId, AccessRole role) {
        return switch (role) {
            case DEPARTMENT_MANAGER -> managerAssignmentRepository.existsByManager_Id(userId)
                ? Optional.of("Cannot revoke Department Manager while the user manages a department.")
                : Optional.empty();
            case PROJECT_MANAGER -> projectRepository
                .existsByProjectManager_IdAndStatusNot(userId, ProjectStatus.CLOSED)
                ? Optional.of(
                    "Cannot revoke Project Manager while the user owns active or non-closed projects.")
                : Optional.empty();
            case EMPLOYEE -> hasEmployeeDependencies(userId)
                ? Optional.of("Cannot revoke Employee while the user has employee profile, "
                    + "department, skill, proposal, or allocation history.")
                : Optional.empty();
            default -> Optional.empty();
        };
    }

    private boolean hasEmployeeDependencies(UUID userId) {
        return membershipRepository.existsByMember_Id(userId)
            || employeeSkillRepository.existsByUser_Id(userId)
            || allocationRepository.existsByEmployee_Id(userId)
            || assignmentProposalRepository.existsByEmployee_Id(userId)
            || deallocationProposalRepository.existsByAllocation_Employee_Id(userId);
    }
}
