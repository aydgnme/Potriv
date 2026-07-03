package me.aydgn.potriv.identity.service;

import me.aydgn.potriv.common.exception.BadRequestException;
import me.aydgn.potriv.common.exception.NotFoundException;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.CurrentUserProvider;
import me.aydgn.potriv.identity.dto.UpdateUserRolesRequest;
import me.aydgn.potriv.identity.dto.UserDetailResponse;
import me.aydgn.potriv.identity.dto.UserSummaryResponse;
import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.entity.UserRole;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.identity.repository.UserRoleRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
public class UserRoleManagementService {

    private final UserRepository userRepository;
    private final UserRoleRepository userRoleRepository;
    private final CurrentUserProvider currentUserProvider;

    public UserRoleManagementService(
        UserRepository userRepository,
        UserRoleRepository userRoleRepository,
        CurrentUserProvider currentUserProvider
    ) {
        this.userRepository = userRepository;
        this.userRoleRepository = userRoleRepository;
        this.currentUserProvider = currentUserProvider;
    }

    @Transactional(readOnly = true)
    public List<UserSummaryResponse> listUsers() {
        AuthenticatedUser currentUser = currentUserProvider.getCurrentUser();

        List<User> users;

        if (currentUser.isSystemAdmin()) {
            users = userRepository.findAllByOrderByCreatedAtDesc();
        } else {
            UUID organizationId = requireCurrentOrganizationId(currentUser);
            users = userRepository.findByOrganization_IdOrderByCreatedAtDesc(organizationId);
        }

        return users.stream()
            .map(this::toSummaryResponse)
            .toList();
    }

    @Transactional(readOnly = true)
    public UserDetailResponse getUser(UUID userId) {
        AuthenticatedUser currentUser = currentUserProvider.getCurrentUser();

        User targetUser = findVisibleUserOrThrow(userId, currentUser);

        return toDetailResponse(targetUser);
    }

    @Transactional
    public UserDetailResponse updateUserRoles(
        UUID userId,
        UpdateUserRolesRequest request
    ) {
        AuthenticatedUser currentUser = currentUserProvider.getCurrentUser();

        User targetUser = findVisibleUserOrThrow(userId, currentUser);

        if (targetUser.getId().equals(currentUser.userId())) {
            throw new BadRequestException("You cannot update your own roles.");
        }

        EnumSet<AccessRole> requestedRoles = normalizeRequestedRoles(request.roles());

        validateRoleUpdate(currentUser, targetUser, requestedRoles);

        List<AccessRole> currentRoles = getRoles(targetUser);

        preventLastOrganizationAdminRemoval(targetUser, currentRoles, requestedRoles);

        EnumSet<AccessRole> rolesToRemove = EnumSet.copyOf(currentRoles);
        rolesToRemove.removeAll(requestedRoles);

        EnumSet<AccessRole> rolesToAdd = EnumSet.copyOf(requestedRoles);
        rolesToAdd.removeAll(currentRoles);

        if (!rolesToRemove.isEmpty()) {
            userRoleRepository.deleteByUserAndRoleIn(targetUser, rolesToRemove);
        }

        for (AccessRole role : rolesToAdd) {
            userRoleRepository.save(new UserRole(targetUser, role));
        }

        return toDetailResponse(targetUser);
    }

    private User findVisibleUserOrThrow(UUID userId, AuthenticatedUser currentUser) {
        User targetUser = userRepository.findById(userId)
            .orElseThrow(() -> new NotFoundException("User was not found."));

        if (currentUser.isSystemAdmin()) {
            return targetUser;
        }

        UUID currentOrganizationId = requireCurrentOrganizationId(currentUser);
        UUID targetOrganizationId = getOrganizationId(targetUser);

        if (!currentOrganizationId.equals(targetOrganizationId)) {
            throw new NotFoundException("User was not found.");
        }

        return targetUser;
    }

    private EnumSet<AccessRole> normalizeRequestedRoles(Set<AccessRole> roles) {
        if (roles == null || roles.isEmpty()) {
            throw new BadRequestException("At least one role must be provided.");
        }

        EnumSet<AccessRole> normalizedRoles = EnumSet.copyOf(roles);

        normalizedRoles.add(AccessRole.EMPLOYEE);

        return normalizedRoles;
    }

    private void validateRoleUpdate(
        AuthenticatedUser currentUser,
        User targetUser,
        EnumSet<AccessRole> requestedRoles
    ) {
        if (!currentUser.isSystemAdmin() && requestedRoles.contains(AccessRole.SYSTEM_ADMIN)) {
            throw new BadRequestException("Only system admins can assign SYSTEM_ADMIN role.");
        }

        if (targetUser.isPlatformUser()) {
            validatePlatformUserRoles(requestedRoles);
            return;
        }

        if (requestedRoles.contains(AccessRole.SYSTEM_ADMIN)) {
            throw new BadRequestException("SYSTEM_ADMIN role can only be assigned to platform users.");
        }
    }

    private void validatePlatformUserRoles(EnumSet<AccessRole> requestedRoles) {
        if (!requestedRoles.equals(EnumSet.of(AccessRole.EMPLOYEE, AccessRole.SYSTEM_ADMIN))
            && !requestedRoles.equals(EnumSet.of(AccessRole.SYSTEM_ADMIN))) {
            throw new BadRequestException("Platform users can only have SYSTEM_ADMIN role.");
        }
    }

    private void preventLastOrganizationAdminRemoval(
        User targetUser,
        List<AccessRole> currentRoles,
        EnumSet<AccessRole> requestedRoles
    ) {
        UUID organizationId = getOrganizationId(targetUser);

        if (organizationId == null) {
            return;
        }

        boolean currentlyOrganizationAdmin = currentRoles.contains(AccessRole.ORGANIZATION_ADMIN);
        boolean willRemainOrganizationAdmin = requestedRoles.contains(AccessRole.ORGANIZATION_ADMIN);

        if (!currentlyOrganizationAdmin || willRemainOrganizationAdmin) {
            return;
        }

        long organizationAdminCount = userRoleRepository.countByUser_Organization_IdAndRole(
            organizationId,
            AccessRole.ORGANIZATION_ADMIN
        );

        if (organizationAdminCount <= 1) {
            throw new BadRequestException("Cannot remove the last organization admin.");
        }
    }

    private List<AccessRole> getRoles(User user) {
        return userRoleRepository.findByUser(user)
            .stream()
            .map(UserRole::getRole)
            .toList();
    }

    private UUID getOrganizationId(User user) {
        return user.getOrganization() == null
            ? null
            : user.getOrganization().getId();
    }

    private UUID requireCurrentOrganizationId(AuthenticatedUser currentUser) {
        if (currentUser.organizationId() == null) {
            throw new BadRequestException("Current user does not belong to an organization.");
        }

        return currentUser.organizationId();
    }

    private UserSummaryResponse toSummaryResponse(User user) {
        return new UserSummaryResponse(
            user.getId(),
            getOrganizationId(user),
            user.getName(),
            user.getEmail(),
            getRoles(user)
        );
    }

    private UserDetailResponse toDetailResponse(User user) {
        return new UserDetailResponse(
            user.getId(),
            getOrganizationId(user),
            user.getName(),
            user.getEmail(),
            getRoles(user),
            user.getCreatedAt(),
            user.getUpdatedAt()
        );
    }
}