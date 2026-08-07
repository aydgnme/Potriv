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
import me.aydgn.potriv.security.entity.SecurityAuditEvent;
import me.aydgn.potriv.security.entity.SecurityAuditEventType;
import me.aydgn.potriv.security.service.SecurityAuditService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
public class UserRoleManagementService {

    private static final String SELF_ROLE_UPDATE_BLOCKED = "You cannot update your own roles.";

    /**
     * The only roles a founder may add to their own account while their
     * organization has no other members. Both are organization-scoped and both
     * are prerequisites the setup workflow cannot obtain any other way.
     */
    private static final EnumSet<AccessRole> SELF_ASSIGNABLE_SETUP_ROLES =
        EnumSet.of(AccessRole.DEPARTMENT_MANAGER, AccessRole.PROJECT_MANAGER);

    private final UserRepository userRepository;
    private final UserRoleRepository userRoleRepository;
    private final CurrentUserProvider currentUserProvider;
    private final SecurityAuditService securityAuditService;

    public UserRoleManagementService(
        UserRepository userRepository,
        UserRoleRepository userRoleRepository,
        CurrentUserProvider currentUserProvider,
        SecurityAuditService securityAuditService
    ) {
        this.userRepository = userRepository;
        this.userRoleRepository = userRoleRepository;
        this.currentUserProvider = currentUserProvider;
        this.securityAuditService = securityAuditService;
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

        EnumSet<AccessRole> requestedRoles = normalizeRequestedRoles(request.roles());

        validateRoleUpdate(currentUser, targetUser, requestedRoles);

        List<AccessRole> currentRoles = getRoles(targetUser);

        boolean selfUpdate = targetUser.getId().equals(currentUser.userId());
        if (selfUpdate) {
            requireSoloOrganizationSetup(targetUser, currentRoles, requestedRoles);
        }

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

        if (selfUpdate) {
            verifyStillSoloAfterWrite(targetUser);
        }

        securityAuditService.record(
            SecurityAuditEvent.builder(SecurityAuditEventType.USER_ROLES_CHANGED, true)
                .userId(targetUser.getId())
                .organizationId(getOrganizationId(targetUser))
                .actorUserId(currentUser.userId())
                .normalizedEmail(targetUser.getEmail())
                .details("Roles changed from " + currentRoles + " to " + requestedRoles + "."
                    + (selfUpdate ? " Solo organization setup." : ""))
                .build()
        );

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

    /**
     * A user may not rewrite their own authorization. The single exception is the
     * founder of an organization that still contains nobody else: without it a
     * one-person organization cannot be set up at all, because appointing a
     * department manager requires the target to already hold
     * {@code DEPARTMENT_MANAGER}, and creating a project requires
     * {@code PROJECT_MANAGER} — neither of which the founder can obtain from
     * anyone.
     *
     * <p>The exception is deliberately narrow. It is additive only, it cannot
     * touch {@code SYSTEM_ADMIN} (rejected earlier by
     * {@link #validateRoleUpdate}), it cannot drop {@code ORGANIZATION_ADMIN} or
     * {@code EMPLOYEE}, and it closes the moment a second person exists. Anything
     * outside it fails with the same message as before, so the general rule is
     * unchanged for every organization that has more than one member.
     *
     * <p>The system-admin console has its own, unconditional self-role block in
     * {@code AdminUserRoleWriteService}; a platform user has no organization and
     * can never reach this path.
     */
    private void requireSoloOrganizationSetup(
        User targetUser,
        List<AccessRole> currentRoles,
        EnumSet<AccessRole> requestedRoles
    ) {
        UUID organizationId = getOrganizationId(targetUser);

        if (organizationId == null
            || !currentRoles.contains(AccessRole.ORGANIZATION_ADMIN)
            || userRepository.countByOrganization_Id(organizationId) != 1) {
            throw new BadRequestException(SELF_ROLE_UPDATE_BLOCKED);
        }

        EnumSet<AccessRole> removed = EnumSet.copyOf(currentRoles);
        removed.removeAll(requestedRoles);
        if (!removed.isEmpty()) {
            throw new BadRequestException(
                "While setting up your organization you can only add roles to your own "
                    + "account, not remove them.");
        }

        EnumSet<AccessRole> added = EnumSet.copyOf(requestedRoles);
        added.removeAll(currentRoles);
        if (!SELF_ASSIGNABLE_SETUP_ROLES.containsAll(added)) {
            throw new BadRequestException(
                "While setting up your organization you can only add "
                    + "DEPARTMENT_MANAGER or PROJECT_MANAGER to your own account.");
        }
    }

    /**
     * Re-reads the organization size after the roles were written. Employee
     * registration does not lock the organization row, so a lock here would not
     * serialize against it; re-counting inside the same transaction does, because
     * PostgreSQL's read-committed isolation makes a concurrently committed
     * registration visible to this statement. A registration that commits between
     * this check and our own commit is not covered — see the class documentation.
     */
    private void verifyStillSoloAfterWrite(User targetUser) {
        UUID organizationId = getOrganizationId(targetUser);

        if (organizationId != null && userRepository.countByOrganization_Id(organizationId) != 1) {
            throw new BadRequestException(SELF_ROLE_UPDATE_BLOCKED);
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