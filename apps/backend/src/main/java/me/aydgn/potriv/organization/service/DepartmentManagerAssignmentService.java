package me.aydgn.potriv.organization.service;

import java.util.Optional;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.common.exception.BadRequestException;
import me.aydgn.potriv.common.exception.ConflictException;
import me.aydgn.potriv.common.exception.NotFoundException;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.CurrentOrganizationResolver;
import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.identity.repository.UserRoleRepository;
import me.aydgn.potriv.organization.dto.DepartmentResponse;
import me.aydgn.potriv.organization.entity.Department;
import me.aydgn.potriv.organization.entity.DepartmentManagerAssignment;
import me.aydgn.potriv.organization.repository.DepartmentManagerAssignmentRepository;
import me.aydgn.potriv.organization.repository.DepartmentRepository;

@Service
public class DepartmentManagerAssignmentService {

    private final DepartmentRepository departmentRepository;
    private final DepartmentManagerAssignmentRepository assignmentRepository;
    private final UserRepository userRepository;
    private final UserRoleRepository userRoleRepository;
    private final CurrentOrganizationResolver currentOrganizationResolver;
    private final DepartmentService departmentService;

    public DepartmentManagerAssignmentService(
        DepartmentRepository departmentRepository,
        DepartmentManagerAssignmentRepository assignmentRepository,
        UserRepository userRepository,
        UserRoleRepository userRoleRepository,
        CurrentOrganizationResolver currentOrganizationResolver,
        DepartmentService departmentService
    ) {
        this.departmentRepository = departmentRepository;
        this.assignmentRepository = assignmentRepository;
        this.userRepository = userRepository;
        this.userRoleRepository = userRoleRepository;
        this.currentOrganizationResolver = currentOrganizationResolver;
        this.departmentService = departmentService;
    }

    @Transactional
    public DepartmentResponse assignManager(
        AuthenticatedUser currentUser,
        UUID departmentId,
        UUID targetUserId
    ) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);

        Department department = departmentRepository
            .findByIdAndOrganization_Id(departmentId, organizationId)
            .orElseThrow(() -> new NotFoundException("Department was not found."));

        User target = requireOrganizationUser(targetUserId, organizationId);

        if (!userRoleRepository.existsByUserAndRole(target, AccessRole.DEPARTMENT_MANAGER)) {
            throw new BadRequestException(
                "Target user must have the DEPARTMENT_MANAGER access role.");
        }

        Optional<DepartmentManagerAssignment> currentDeptAssignment =
            assignmentRepository.findByDepartment_Id(departmentId);

        if (currentDeptAssignment.isPresent()
            && currentDeptAssignment.get().getManager().getId().equals(targetUserId)) {
            // Idempotent: the same manager is already assigned to this department.
            return departmentService.get(currentUser, departmentId);
        }

        // The requested manager must not already manage a different department.
        assignmentRepository.findByManager_Id(targetUserId).ifPresent(existing -> {
            if (!existing.getDepartment().getId().equals(departmentId)) {
                throw new ConflictException(
                    "User already manages another department.");
            }
        });

        // Replacing an existing manager: remove the old row first and flush so the
        // unique department_id constraint is free before inserting the new row.
        currentDeptAssignment.ifPresent(existing -> {
            assignmentRepository.delete(existing);
            assignmentRepository.flush();
        });

        User assignedBy = userRepository.findById(currentUser.userId())
            .orElseThrow(() -> new NotFoundException("Authenticated user was not found."));

        try {
            assignmentRepository.saveAndFlush(
                new DepartmentManagerAssignment(department, target, assignedBy));
        } catch (DataIntegrityViolationException exception) {
            // A concurrent assignment won the unique constraint race.
            throw new ConflictException(
                "Department or user already has a manager assignment.");
        }

        return departmentService.get(currentUser, departmentId);
    }

    @Transactional
    public void unassignManager(AuthenticatedUser currentUser, UUID departmentId) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);

        departmentRepository.findByIdAndOrganization_Id(departmentId, organizationId)
            .orElseThrow(() -> new NotFoundException("Department was not found."));

        // Idempotent: removes the assignment if present; never touches access roles.
        assignmentRepository.findByDepartment_Id(departmentId)
            .ifPresent(assignmentRepository::delete);
    }

    private User requireOrganizationUser(UUID userId, UUID organizationId) {
        return userRepository.findById(userId)
            .filter(user -> user.getOrganization() != null
                && user.getOrganization().getId().equals(organizationId))
            .orElseThrow(() -> new NotFoundException("User was not found."));
    }
}
