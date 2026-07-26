package me.aydgn.potriv.admin.security;

import java.time.Duration;
import java.util.Locale;

import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.common.config.AuthProperties;
import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.identity.repository.UserRoleRepository;
import me.aydgn.potriv.security.entity.SecurityAuditEvent;
import me.aydgn.potriv.security.entity.SecurityAuditEventType;
import me.aydgn.potriv.security.service.SecurityAuditService;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Verifies admin-console browser-login credentials against the existing Potriv
 * user model, mirroring the JWT login's account-status, BCrypt, failed-attempt,
 * lockout, and audit semantics. Only {@link AccessRole#SYSTEM_ADMIN} users are
 * granted an admin session; every failure returns the same generic error so the
 * form never reveals whether the email exists, is inactive, is locked, or lacks
 * the role.
 */
@Service
public class AdminAuthenticationService {

    private final UserRepository userRepository;
    private final UserRoleRepository userRoleRepository;
    private final PasswordEncoder passwordEncoder;
    private final SecurityAuditService securityAuditService;
    private final int maxFailedLoginAttempts;
    private final Duration loginLockDuration;

    public AdminAuthenticationService(
        UserRepository userRepository,
        UserRoleRepository userRoleRepository,
        PasswordEncoder passwordEncoder,
        SecurityAuditService securityAuditService,
        AuthProperties authProperties
    ) {
        this.userRepository = userRepository;
        this.userRoleRepository = userRoleRepository;
        this.passwordEncoder = passwordEncoder;
        this.securityAuditService = securityAuditService;
        this.maxFailedLoginAttempts = authProperties.maxFailedLoginAttempts();
        this.loginLockDuration = Duration.ofMinutes(authProperties.lockDurationMinutes());
    }

    // Failed-attempt and lockout updates must persist even though the request
    // is rejected with an exception (mirrors JwtAuthenticationService).
    @Transactional(noRollbackFor = BadCredentialsException.class)
    public AdminPrincipal authenticate(
        String email, String rawPassword, String userAgent, String ipAddress) {
        String normalizedEmail = email == null ? "" : email.trim().toLowerCase(Locale.ROOT);

        User user = userRepository.findByEmailForUpdate(normalizedEmail)
            .orElseThrow(() -> {
                auditFailure(null, normalizedEmail, userAgent, ipAddress, "Unknown email.");
                return invalidCredentials();
            });

        if (!user.isActive() || user.isLoginLocked()) {
            auditFailure(user, normalizedEmail, userAgent, ipAddress,
                user.isActive() ? "Account is locked." : "Account is not active.");
            throw invalidCredentials();
        }

        if (!passwordEncoder.matches(rawPassword, user.getPasswordHash())) {
            user.registerFailedLogin(maxFailedLoginAttempts, loginLockDuration);
            auditFailure(user, normalizedEmail, userAgent, ipAddress, "Wrong password.");
            if (user.isLoginLocked()) {
                securityAuditService.record(
                    SecurityAuditEvent.builder(SecurityAuditEventType.ACCOUNT_LOCKED, false)
                        .userId(user.getId())
                        .normalizedEmail(normalizedEmail)
                        .userAgent(userAgent)
                        .ipAddress(ipAddress)
                        .details("Account locked after too many failed admin login attempts.")
                        .build());
            }
            throw invalidCredentials();
        }

        // Global cross-tenant admin: only SYSTEM_ADMIN may hold an admin session.
        if (!userRoleRepository.existsByUserAndRole(user, AccessRole.SYSTEM_ADMIN)) {
            auditFailure(user, normalizedEmail, userAgent, ipAddress,
                "User is not a system administrator.");
            throw invalidCredentials();
        }

        user.resetLoginFailures();
        securityAuditService.record(
            SecurityAuditEvent.builder(SecurityAuditEventType.LOGIN_SUCCEEDED, true)
                .userId(user.getId())
                .normalizedEmail(normalizedEmail)
                .userAgent(userAgent)
                .ipAddress(ipAddress)
                .details("Admin console login.")
                .build());
        return new AdminPrincipal(user.getId(), user.getName(), user.getEmail());
    }

    private void auditFailure(
        User user, String normalizedEmail, String userAgent, String ipAddress, String reason) {
        SecurityAuditEvent.Builder builder =
            SecurityAuditEvent.builder(SecurityAuditEventType.LOGIN_FAILED, false)
                .normalizedEmail(normalizedEmail)
                .userAgent(userAgent)
                .ipAddress(ipAddress)
                .details("Admin console: " + reason);
        if (user != null) {
            builder.userId(user.getId());
        }
        securityAuditService.record(builder.build());
    }

    private static BadCredentialsException invalidCredentials() {
        return new BadCredentialsException("Invalid email or password.");
    }
}
