package me.aydgn.potriv.admin.service;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.admin.security.AdminPrincipal;
import me.aydgn.potriv.admin.support.AdminNotFoundException;
import me.aydgn.potriv.admin.support.AdminValidationException;
import me.aydgn.potriv.identity.entity.AccessAccountStatus;
import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.identity.repository.UserRoleRepository;
import me.aydgn.potriv.security.entity.SecurityAuditEvent;
import me.aydgn.potriv.security.entity.SecurityAuditEventType;
import me.aydgn.potriv.security.service.SecurityAuditService;

/**
 * Transactional write service for the narrow, production-safe user
 * account-operations slice: display-name edit, activate/suspend, and clearing a
 * lockout. It never touches password, email, organization, or roles, never hard-
 * deletes, and enforces two safety rules: an admin cannot suspend themselves,
 * and the last active {@code SYSTEM_ADMIN} cannot be suspended.
 */
@Service
public class AdminUserWriteService {

    /** Outcome of a status action, mapped by the controller to a flash message. */
    public enum StatusOutcome {
        CHANGED,
        UNCHANGED,
        BLOCKED_SELF,
        BLOCKED_LAST_ADMIN
    }

    private final UserRepository userRepository;
    private final UserRoleRepository userRoleRepository;
    private final SecurityAuditService securityAuditService;

    public AdminUserWriteService(
        UserRepository userRepository,
        UserRoleRepository userRoleRepository,
        SecurityAuditService securityAuditService
    ) {
        this.userRepository = userRepository;
        this.userRoleRepository = userRoleRepository;
        this.securityAuditService = securityAuditService;
    }

    @Transactional
    public void updateName(UUID userId, String rawName, AdminPrincipal actor) {
        User user = requireUser(userId);
        String name = rawName == null ? "" : rawName.trim();
        if (name.isEmpty()) {
            throw new AdminValidationException("name", "Name is required.");
        }
        user.updateProfile(name);
        audit(SecurityAuditEventType.ADMIN_USER_PROFILE_UPDATED, true, user, actor,
            "Updated display name");
    }

    /** Returns {@code true} when the status changed, {@code false} if already active. */
    @Transactional
    public boolean activate(UUID userId, AdminPrincipal actor) {
        User user = requireUser(userId);
        if (user.getStatus() == AccessAccountStatus.ACTIVE) {
            return false;
        }
        user.changeStatus(AccessAccountStatus.ACTIVE);
        audit(SecurityAuditEventType.ADMIN_USER_STATUS_CHANGED, true, user, actor,
            "Activated account");
        return true;
    }

    @Transactional
    public StatusOutcome suspend(UUID userId, AdminPrincipal actor) {
        User user = requireUser(userId);

        if (actor != null && userId.equals(actor.userId())) {
            audit(SecurityAuditEventType.ADMIN_USER_ACTION_BLOCKED, false, user, actor,
                "Blocked: admin cannot suspend own account");
            return StatusOutcome.BLOCKED_SELF;
        }
        if (isLastActiveSystemAdmin(user)) {
            audit(SecurityAuditEventType.ADMIN_USER_ACTION_BLOCKED, false, user, actor,
                "Blocked: cannot suspend the last active SYSTEM_ADMIN");
            return StatusOutcome.BLOCKED_LAST_ADMIN;
        }
        if (user.getStatus() == AccessAccountStatus.SUSPENDED) {
            return StatusOutcome.UNCHANGED;
        }
        user.changeStatus(AccessAccountStatus.SUSPENDED);
        audit(SecurityAuditEventType.ADMIN_USER_STATUS_CHANGED, true, user, actor,
            "Suspended account");
        return StatusOutcome.CHANGED;
    }

    /** Clears the lockout and resets the failed-login counter. Idempotent. */
    @Transactional
    public void unlock(UUID userId, AdminPrincipal actor) {
        User user = requireUser(userId);
        user.resetLoginFailures();
        audit(SecurityAuditEventType.ADMIN_USER_UNLOCKED, true, user, actor,
            "Cleared lockout and reset failed logins");
    }

    private boolean isLastActiveSystemAdmin(User user) {
        if (!userRoleRepository.existsByUserAndRole(user, AccessRole.SYSTEM_ADMIN)) {
            return false;
        }
        // Count other users still holding an active SYSTEM_ADMIN account.
        return userRoleRepository.countByRoleAndUser_StatusAndUser_IdNot(
            AccessRole.SYSTEM_ADMIN, AccessAccountStatus.ACTIVE, user.getId()) == 0;
    }

    private User requireUser(UUID userId) {
        return userRepository.findByIdForUpdate(userId)
            .orElseThrow(() -> new AdminNotFoundException("User was not found."));
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
