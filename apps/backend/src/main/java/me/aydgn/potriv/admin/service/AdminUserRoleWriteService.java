package me.aydgn.potriv.admin.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.admin.security.AdminPrincipal;
import me.aydgn.potriv.admin.support.AdminNotFoundException;
import me.aydgn.potriv.admin.viewmodel.AdminUserRoleViews.RoleRow;
import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.entity.UserRole;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.identity.repository.UserRoleRepository;
import me.aydgn.potriv.security.entity.SecurityAuditEvent;
import me.aydgn.potriv.security.entity.SecurityAuditEventType;
import me.aydgn.potriv.security.service.SecurityAuditService;

/**
 * Transactional write service for user role management. Only the four
 * organization-scoped roles are manageable; {@code SYSTEM_ADMIN} is never
 * grantable or revocable here (form tampering is rejected server-side). The
 * signed-in admin cannot change their own roles, suspended users are immutable,
 * and unsafe revocations are blocked by {@link AdminUserRoleGuards}. Granting a
 * role never creates a department-manager assignment, project ownership, or
 * employee profile — it only adds the authorization row.
 */
@Service
public class AdminUserRoleWriteService {

    /** The roles this UI may grant/revoke, in display order. Excludes SYSTEM_ADMIN. */
    public static final List<AccessRole> MANAGEABLE_ROLES = List.of(
        AccessRole.EMPLOYEE,
        AccessRole.ORGANIZATION_ADMIN,
        AccessRole.DEPARTMENT_MANAGER,
        AccessRole.PROJECT_MANAGER);

    private static final Set<AccessRole> MANAGEABLE = Set.copyOf(MANAGEABLE_ROLES);

    /** Outcome of a grant/revoke, mapped by the controller to a flash message. */
    public record RoleActionOutcome(Kind kind, String message) {
        public enum Kind { SUCCESS, INFO, BLOCKED }

        static RoleActionOutcome success(String message) {
            return new RoleActionOutcome(Kind.SUCCESS, message);
        }

        static RoleActionOutcome info(String message) {
            return new RoleActionOutcome(Kind.INFO, message);
        }

        static RoleActionOutcome blocked(String message) {
            return new RoleActionOutcome(Kind.BLOCKED, message);
        }
    }

    private final UserRepository userRepository;
    private final UserRoleRepository userRoleRepository;
    private final AdminUserRoleGuards guards;
    private final SecurityAuditService securityAuditService;

    public AdminUserRoleWriteService(
        UserRepository userRepository,
        UserRoleRepository userRoleRepository,
        AdminUserRoleGuards guards,
        SecurityAuditService securityAuditService
    ) {
        this.userRepository = userRepository;
        this.userRoleRepository = userRoleRepository;
        this.guards = guards;
        this.securityAuditService = securityAuditService;
    }

    /** Manageable-role rows for the role-management page (held + revoke-block state). */
    @Transactional(readOnly = true)
    public List<RoleRow> roleRows(UUID userId, List<String> currentRoleNames) {
        List<RoleRow> rows = new ArrayList<>();
        for (AccessRole role : MANAGEABLE_ROLES) {
            boolean held = currentRoleNames.contains(role.name());
            Optional<String> reason = held
                ? guards.revokeBlockReason(userId, role) : Optional.empty();
            rows.add(new RoleRow(role.name(), held, reason.isPresent(), reason.orElse(null)));
        }
        return rows;
    }

    @Transactional
    public RoleActionOutcome grant(UUID userId, String rawRole, AdminPrincipal actor) {
        User user = requireUser(userId);
        AccessRole role = parseManageable(rawRole);
        if (role == null) {
            return blockedInvalid(user, actor, rawRole);
        }
        if (!user.isActive()) {
            return blocked(user, actor, role, "Only active users can have roles changed.");
        }
        if (user.getOrganization() == null) {
            return blocked(user, actor, role, "The user must belong to an organization.");
        }
        if (userRoleRepository.existsByUserAndRole(user, role)) {
            return RoleActionOutcome.info("User already has the " + label(role) + " role.");
        }
        userRoleRepository.save(new UserRole(user, role));
        audit(SecurityAuditEventType.ADMIN_USER_ROLE_GRANTED, true, user, actor,
            "Granted role " + role.name());
        return RoleActionOutcome.success(label(role) + " role granted.");
    }

    @Transactional
    public RoleActionOutcome revoke(UUID userId, String rawRole, AdminPrincipal actor) {
        User user = requireUser(userId);
        AccessRole role = parseManageable(rawRole);
        if (role == null) {
            return blockedInvalid(user, actor, rawRole);
        }
        if (actor != null && userId.equals(actor.userId())) {
            return blocked(user, actor, role, "You cannot change your own roles.");
        }
        if (!user.isActive()) {
            return blocked(user, actor, role, "Only active users can have roles changed.");
        }
        if (!userRoleRepository.existsByUserAndRole(user, role)) {
            return RoleActionOutcome.info("User does not have the " + label(role) + " role.");
        }
        Optional<String> reason = guards.revokeBlockReason(userId, role);
        if (reason.isPresent()) {
            return blocked(user, actor, role, reason.get());
        }
        userRoleRepository.deleteByUserAndRoleIn(user, List.of(role));
        audit(SecurityAuditEventType.ADMIN_USER_ROLE_REVOKED, true, user, actor,
            "Revoked role " + role.name());
        return RoleActionOutcome.success(label(role) + " role revoked.");
    }

    private RoleActionOutcome blockedInvalid(User user, AdminPrincipal actor, String rawRole) {
        audit(SecurityAuditEventType.ADMIN_USER_ROLE_ACTION_BLOCKED, false, user, actor,
            "Blocked unmanageable role: " + rawRole);
        return RoleActionOutcome.blocked("This role cannot be managed from the admin console.");
    }

    private RoleActionOutcome blocked(
        User user, AdminPrincipal actor, AccessRole role, String reason) {
        audit(SecurityAuditEventType.ADMIN_USER_ROLE_ACTION_BLOCKED, false, user, actor,
            "Blocked " + role.name() + ": " + reason);
        return RoleActionOutcome.blocked(reason);
    }

    private User requireUser(UUID userId) {
        return userRepository.findByIdForUpdate(userId)
            .orElseThrow(() -> new AdminNotFoundException("User was not found."));
    }

    private static AccessRole parseManageable(String rawRole) {
        if (rawRole == null || rawRole.isBlank()) {
            return null;
        }
        try {
            AccessRole role = AccessRole.valueOf(rawRole.trim());
            return MANAGEABLE.contains(role) ? role : null;
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private static String label(AccessRole role) {
        return switch (role) {
            case EMPLOYEE -> "Employee";
            case ORGANIZATION_ADMIN -> "Organization Admin";
            case DEPARTMENT_MANAGER -> "Department Manager";
            case PROJECT_MANAGER -> "Project Manager";
            default -> role.name();
        };
    }

    private void audit(
        SecurityAuditEventType type, boolean success, User target,
        AdminPrincipal actor, String details) {
        securityAuditService.record(SecurityAuditEvent.builder(type, success)
            .userId(target.getId())
            .actorUserId(actor == null ? null : actor.userId())
            .organizationId(target.getOrganization() == null
                ? null : target.getOrganization().getId())
            .details(details)
            .build());
    }
}
