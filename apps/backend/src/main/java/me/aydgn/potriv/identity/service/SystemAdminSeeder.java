package me.aydgn.potriv.identity.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.identity.entity.AccessAccountStatus;
import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.entity.UserRole;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.identity.repository.UserRoleRepository;
import me.aydgn.potriv.security.entity.SecurityAuditEvent;
import me.aydgn.potriv.security.entity.SecurityAuditEventType;
import me.aydgn.potriv.security.service.SecurityAuditService;

/**
 * Bootstraps the platform {@code SYSTEM_ADMIN} account from configuration, as an
 * <strong>idempotent reconciler</strong> rather than a one-shot seeder: on every
 * start the account described by {@code potriv.system-admin.*} is brought back
 * in line with the configuration.
 *
 * <p>This exists because a create-only seeder made the configuration a lie —
 * changing {@code SYSTEM_ADMIN_PASSWORD} did nothing once the account existed,
 * and an account that had been locked out or suspended could not be repaired
 * with the credentials the deployment owns, which forced manual database edits.
 *
 * <p><strong>The bootstrap account is configuration-owned break-glass access.</strong>
 * Suspending or locking it does not stick: the next start reconciles it back to
 * active. To retire it, change or remove {@code SYSTEM_ADMIN_EMAIL} — do not
 * rely on suspending the account. Every reconciliation that actually changes
 * something is audited (never with secret values).
 *
 * <p>No raw password or password hash is ever logged, audited, or returned.
 */
@Component
public class SystemAdminSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SystemAdminSeeder.class);

    private final UserRepository userRepository;
    private final UserRoleRepository userRoleRepository;
    private final PasswordEncoder passwordEncoder;
    private final SecurityAuditService securityAuditService;

    @Value("${potriv.system-admin.email}")
    private String email;

    @Value("${potriv.system-admin.password}")
    private String password;

    @Value("${potriv.system-admin.name}")
    private String name;

    public SystemAdminSeeder(
        UserRepository userRepository,
        UserRoleRepository userRoleRepository,
        PasswordEncoder passwordEncoder,
        SecurityAuditService securityAuditService
    ) {
        this.userRepository = userRepository;
        this.userRoleRepository = userRoleRepository;
        this.passwordEncoder = passwordEncoder;
        this.securityAuditService = securityAuditService;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        reconcile();
    }

    /**
     * Creates or reconciles the configured system admin. Returns the names of the
     * fields that changed — empty when the account already matched, which is the
     * normal case on a restart.
     */
    @Transactional
    public List<String> reconcile() {
        // The rest of the identity code looks accounts up by a trimmed,
        // lower-cased email; storing anything else here would create an account
        // that can never be logged into.
        String normalizedEmail = email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
        String displayName = name == null ? "" : name.trim();

        Optional<User> existing = userRepository.findByEmailForUpdate(normalizedEmail);
        if (existing.isEmpty()) {
            create(normalizedEmail, displayName);
            return List.of("created");
        }
        return reconcileExisting(existing.get(), displayName);
    }

    private void create(String normalizedEmail, String displayName) {
        User systemAdmin = userRepository.save(new User(
            null, displayName, normalizedEmail, passwordEncoder.encode(password)));
        userRoleRepository.save(new UserRole(systemAdmin, AccessRole.SYSTEM_ADMIN));

        log.info("Bootstrapped the system administrator account.");
        audit(SecurityAuditEventType.SYSTEM_ADMIN_BOOTSTRAP_CREATED, systemAdmin,
            "Created the configured system administrator account");
    }

    private List<String> reconcileExisting(User user, String displayName) {
        List<String> changed = new ArrayList<>();

        if (!displayName.isEmpty() && !displayName.equals(user.getName())) {
            user.updateProfile(displayName);
            changed.add("name");
        }

        // Rotating SYSTEM_ADMIN_PASSWORD in the environment must actually rotate
        // the credential; comparing against the stored hash keeps this a no-op
        // when the password is unchanged.
        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            user.changePassword(passwordEncoder.encode(password));
            changed.add("password");
        }

        if (user.getStatus() != AccessAccountStatus.ACTIVE) {
            user.changeStatus(AccessAccountStatus.ACTIVE);
            changed.add("status");
        }

        if (user.isLoginLocked() || user.getFailedLoginAttempts() > 0) {
            user.resetLoginFailures();
            changed.add("lockout");
        }

        if (!userRoleRepository.existsByUserAndRole(user, AccessRole.SYSTEM_ADMIN)) {
            userRoleRepository.save(new UserRole(user, AccessRole.SYSTEM_ADMIN));
            changed.add("role");
        }

        if (!changed.isEmpty()) {
            // Field names only — never the values, so no secret can reach a log
            // line or an audit row.
            log.info("Reconciled the system administrator account: {}", changed);
            audit(SecurityAuditEventType.SYSTEM_ADMIN_BOOTSTRAP_RECONCILED, user,
                "changedFields=" + changed);
        }
        return changed;
    }

    private void audit(SecurityAuditEventType type, User target, String details) {
        securityAuditService.record(SecurityAuditEvent.builder(type, true)
            .userId(target.getId())
            .details(details)
            .build());
    }
}
