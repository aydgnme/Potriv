package me.aydgn.potriv.organization.service;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.common.exception.BadRequestException;
import me.aydgn.potriv.common.exception.ConflictException;
import me.aydgn.potriv.common.exception.ForbiddenException;
import me.aydgn.potriv.common.exception.NotFoundException;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.CurrentOrganizationResolver;
import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.entity.UserRole;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.identity.repository.UserRoleRepository;
import me.aydgn.potriv.organization.dto.DepartmentUserResponse;
import me.aydgn.potriv.organization.entity.Department;
import me.aydgn.potriv.organization.entity.DepartmentManagerAssignment;
import me.aydgn.potriv.organization.entity.DepartmentMembership;
import me.aydgn.potriv.organization.repository.DepartmentManagerAssignmentRepository;
import me.aydgn.potriv.organization.repository.DepartmentMembershipRepository;

@Service
public class DepartmentMembershipService {

    private final DepartmentMembershipRepository membershipRepository;
    private final DepartmentManagerAssignmentRepository managerAssignmentRepository;
    private final UserRepository userRepository;
    private final UserRoleRepository userRoleRepository;
    private final CurrentOrganizationResolver currentOrganizationResolver;

    public DepartmentMembershipService(
        DepartmentMembershipRepository membershipRepository,
        DepartmentManagerAssignmentRepository managerAssignmentRepository,
        UserRepository userRepository,
        UserRoleRepository userRoleRepository,
        CurrentOrganizationResolver currentOrganizationResolver
    ) {
        this.membershipRepository = membershipRepository;
        this.managerAssignmentRepository = managerAssignmentRepository;
        this.userRepository = userRepository;
        this.userRoleRepository = userRoleRepository;
        this.currentOrganizationResolver = currentOrganizationResolver;
    }

    @Transactional(readOnly = true)
    public List<DepartmentUserResponse> listUnassignedEmployees(AuthenticatedUser currentUser) {
        Department managedDepartment = requireManagedDepartment(currentUser);
        UUID organizationId = managedDepartment.getOrganization().getId();

        List<User> employees = membershipRepository.findUnassignedEmployees(
            organizationId, AccessRole.EMPLOYEE);

        return toUserResponses(employees);
    }

    @Transactional(readOnly = true)
    public List<DepartmentUserResponse> listMembers(
        AuthenticatedUser currentUser,
        UUID departmentId
    ) {
        requireManagedTargetDepartment(currentUser, departmentId);

        List<User> members = membershipRepository.findMembersByDepartmentId(departmentId).stream()
            .map(DepartmentMembership::getMember)
            .toList();

        return toUserResponses(members);
    }

    @Transactional
    public DepartmentUserResponse addMember(
        AuthenticatedUser currentUser,
        UUID departmentId,
        UUID targetUserId
    ) {
        Department managedDepartment = requireManagedTargetDepartment(currentUser, departmentId);
        UUID organizationId = managedDepartment.getOrganization().getId();

        User target = requireOrganizationUser(targetUserId, organizationId);

        if (!userRoleRepository.existsByUserAndRole(target, AccessRole.EMPLOYEE)) {
            throw new BadRequestException("Target user must have the EMPLOYEE access role.");
        }

        var existing = membershipRepository.findByMember_Id(targetUserId);
        if (existing.isPresent()) {
            if (existing.get().getDepartment().getId().equals(departmentId)) {
                // Idempotent: already a member of this department.
                return toUserResponse(target);
            }
            // No auto-move: the old manager must remove the member first.
            throw new ConflictException("User already belongs to another department.");
        }

        User assignedBy = userRepository.findById(currentUser.userId())
            .orElseThrow(() -> new NotFoundException("Authenticated user was not found."));

        try {
            membershipRepository.saveAndFlush(
                new DepartmentMembership(managedDepartment, target, assignedBy));
        } catch (DataIntegrityViolationException exception) {
            // A concurrent assignment won the unique member_user_id race.
            throw new ConflictException("User already belongs to another department.");
        }

        return toUserResponse(target);
    }

    @Transactional
    public void removeMember(AuthenticatedUser currentUser, UUID departmentId, UUID targetUserId) {
        requireManagedTargetDepartment(currentUser, departmentId);
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);

        // Cross-org / platform target must not leak: treat as not found.
        requireOrganizationUser(targetUserId, organizationId);

        var membership = membershipRepository.findByMember_Id(targetUserId);
        if (membership.isEmpty()) {
            // Idempotent: already unassigned.
            return;
        }

        if (!membership.get().getDepartment().getId().equals(departmentId)) {
            // Member of a different department: anti-leak, do not remove.
            throw new NotFoundException("Member was not found in this department.");
        }

        // Never deletes the User, only the membership row.
        membershipRepository.delete(membership.get());
    }

    private Department requireManagedDepartment(AuthenticatedUser currentUser) {
        // Ensures the current user is genuinely assigned as a manager; holding the
        // DEPARTMENT_MANAGER role alone is not enough.
        currentOrganizationResolver.requireOrganizationId(currentUser);

        return managerAssignmentRepository.findByManager_Id(currentUser.userId())
            .map(DepartmentManagerAssignment::getDepartment)
            .orElseThrow(() -> new ForbiddenException(
                "You are not assigned as a department manager."));
    }

    private Department requireManagedTargetDepartment(
        AuthenticatedUser currentUser,
        UUID departmentId
    ) {
        Department managedDepartment = requireManagedDepartment(currentUser);

        if (!managedDepartment.getId().equals(departmentId)) {
            // Managing a different department, or the target is cross-org/unknown:
            // anti-leak 404 either way.
            throw new NotFoundException("Department was not found.");
        }

        return managedDepartment;
    }

    private User requireOrganizationUser(UUID userId, UUID organizationId) {
        return userRepository.findById(userId)
            .filter(user -> user.getOrganization() != null
                && user.getOrganization().getId().equals(organizationId))
            .orElseThrow(() -> new NotFoundException("User was not found."));
    }

    private List<DepartmentUserResponse> toUserResponses(List<User> users) {
        if (users.isEmpty()) {
            return List.of();
        }

        List<UUID> ids = users.stream().map(User::getId).toList();

        // Batch-load roles once to avoid N+1 across the listing.
        Map<UUID, List<AccessRole>> rolesByUser = userRoleRepository.findByUser_IdIn(ids).stream()
            .collect(Collectors.groupingBy(
                role -> role.getUser().getId(),
                Collectors.mapping(UserRole::getRole, Collectors.toList())));

        return users.stream()
            .map(user -> new DepartmentUserResponse(
                user.getId(),
                user.getName(),
                user.getEmail(),
                rolesByUser.getOrDefault(user.getId(), List.of())))
            .toList();
    }

    private DepartmentUserResponse toUserResponse(User user) {
        List<AccessRole> roles = userRoleRepository.findByUser(user).stream()
            .map(UserRole::getRole)
            .toList();
        return new DepartmentUserResponse(user.getId(), user.getName(), user.getEmail(), roles);
    }
}
