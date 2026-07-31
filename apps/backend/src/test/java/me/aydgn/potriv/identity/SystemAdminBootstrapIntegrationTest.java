package me.aydgn.potriv.identity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import me.aydgn.potriv.AbstractIntegrationTest;
import me.aydgn.potriv.identity.entity.AccessAccountStatus;
import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.identity.repository.UserRoleRepository;
import me.aydgn.potriv.identity.service.SystemAdminSeeder;
import me.aydgn.potriv.security.entity.SecurityAuditEventType;
import me.aydgn.potriv.security.repository.SecurityAuditEventRepository;

/**
 * The system-admin bootstrap must behave as an idempotent reconciler: the
 * configured account is created when missing and brought back in line with the
 * configuration when it already exists — without manual database edits, and
 * without ever exposing the password.
 */
class SystemAdminBootstrapIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private SystemAdminSeeder seeder;
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private UserRoleRepository userRoleRepository;
    @Autowired
    private PasswordEncoder passwordEncoder;
    @Autowired
    private SecurityAuditEventRepository auditEventRepository;

    private final java.util.Set<String> createdEmails = new java.util.LinkedHashSet<>();

    /** Points the seeder at a throwaway account so the shared seeded admin is untouched. */
    private String useAccount(String email, String password, String name) {
        ReflectionTestUtils.setField(seeder, "email", email);
        ReflectionTestUtils.setField(seeder, "password", password);
        ReflectionTestUtils.setField(seeder, "name", name);
        String normalized = email.trim().toLowerCase();
        createdEmails.add(normalized);
        return normalized;
    }

    /**
     * Removes the throwaway admins this class creates.
     *
     * <p>The suite shares one database, and these are real <em>active</em>
     * {@code SYSTEM_ADMIN} accounts. Leaving them behind changes global state
     * other tests legitimately depend on — {@code AdminUserFormIntegrationTest}
     * asserts that the <em>last</em> active system admin cannot be suspended, and
     * silently stops testing anything if spare admins linger.
     */
    @AfterEach
    void removeBootstrapAccounts() {
        createdEmails.forEach(email -> userRepository.findByEmail(email).ifPresent(user -> {
            userRoleRepository.deleteAll(userRoleRepository.findByUser(user));
            userRepository.delete(user);
        }));
        createdEmails.clear();
    }

    private User reload(String email) {
        return userRepository.findByEmail(email).orElseThrow();
    }

    private long systemAdminRoleCount(User user) {
        return userRoleRepository.findByUser(user).stream()
            .filter(role -> role.getRole() == AccessRole.SYSTEM_ADMIN)
            .count();
    }

    private boolean audited(SecurityAuditEventType type) {
        return auditEventRepository.findAll().stream().anyMatch(e -> e.getEventType() == type);
    }

    @Test
    void createsMissingAccountWithSystemAdminRole() {
        String email = useAccount("boot-create-" + System.nanoTime() + "@potriv.test",
            "BootstrapPassword1!", "Bootstrap Admin");

        seeder.reconcile();

        User created = reload(email);
        assertThat(created.getName()).isEqualTo("Bootstrap Admin");
        assertThat(created.getStatus()).isEqualTo(AccessAccountStatus.ACTIVE);
        assertThat(created.getOrganization()).isNull();
        assertThat(systemAdminRoleCount(created)).isEqualTo(1);
        assertThat(passwordEncoder.matches("BootstrapPassword1!", created.getPasswordHash()))
            .isTrue();
        assertThat(audited(SecurityAuditEventType.SYSTEM_ADMIN_BOOTSTRAP_CREATED)).isTrue();
    }

    @Test
    void normalizesConfiguredEmailSoTheAccountCanActuallyLogIn() {
        String mixedCase = "Boot-Case-" + System.nanoTime() + "@Potriv.TEST";
        useAccount("  " + mixedCase + "  ", "BootstrapPassword1!", "Case Admin");

        seeder.reconcile();

        // The rest of the identity code looks users up by the normalized email.
        assertThat(userRepository.findByEmail(mixedCase.trim().toLowerCase())).isPresent();
    }

    @Test
    void rotatesPasswordWhenConfiguredPasswordChanges() {
        String email = useAccount("boot-rotate-" + System.nanoTime() + "@potriv.test",
            "OriginalPassword1!", "Rotate Admin");
        seeder.reconcile();

        useAccount(email, "RotatedPassword2!", "Rotate Admin");
        List<String> changed = seeder.reconcile();

        User rotated = reload(email);
        assertThat(changed).contains("password");
        assertThat(passwordEncoder.matches("RotatedPassword2!", rotated.getPasswordHash())).isTrue();
        assertThat(passwordEncoder.matches("OriginalPassword1!", rotated.getPasswordHash()))
            .isFalse();
        assertThat(audited(SecurityAuditEventType.SYSTEM_ADMIN_BOOTSTRAP_RECONCILED)).isTrue();
    }

    @Test
    void updatesDisplayNameWhenConfiguredNameChanges() {
        String email = useAccount("boot-name-" + System.nanoTime() + "@potriv.test",
            "BootstrapPassword1!", "Old Name");
        seeder.reconcile();

        useAccount(email, "BootstrapPassword1!", "New Name");
        List<String> changed = seeder.reconcile();

        assertThat(changed).contains("name");
        assertThat(reload(email).getName()).isEqualTo("New Name");
    }

    @Test
    void unlocksLockedOutAccountAndResetsFailedAttempts() {
        String email = useAccount("boot-lock-" + System.nanoTime() + "@potriv.test",
            "BootstrapPassword1!", "Lock Admin");
        seeder.reconcile();

        User locked = reload(email);
        locked.registerFailedLogin(1, Duration.ofMinutes(15));
        userRepository.save(locked);
        assertThat(reload(email).isLoginLocked()).isTrue();

        List<String> changed = seeder.reconcile();

        User repaired = reload(email);
        assertThat(changed).contains("lockout");
        assertThat(repaired.isLoginLocked()).isFalse();
        assertThat(repaired.getFailedLoginAttempts()).isZero();
    }

    /**
     * The bootstrap account is configuration-owned break-glass access, so a
     * suspension does not survive a restart. Documented in
     * docs/backend/environment.md: retire it by changing SYSTEM_ADMIN_EMAIL,
     * not by suspending it.
     */
    @Test
    void reactivatesSuspendedAccount() {
        String email = useAccount("boot-susp-" + System.nanoTime() + "@potriv.test",
            "BootstrapPassword1!", "Susp Admin");
        seeder.reconcile();

        User suspended = reload(email);
        suspended.changeStatus(AccessAccountStatus.SUSPENDED);
        userRepository.save(suspended);

        List<String> changed = seeder.reconcile();

        assertThat(changed).contains("status");
        assertThat(reload(email).getStatus()).isEqualTo(AccessAccountStatus.ACTIVE);
    }

    @Test
    void repeatedRunsAreIdempotentAndDoNotDuplicateRoles() {
        String email = useAccount("boot-idem-" + System.nanoTime() + "@potriv.test",
            "BootstrapPassword1!", "Idem Admin");

        seeder.reconcile();
        List<String> second = seeder.reconcile();
        List<String> third = seeder.reconcile();

        assertThat(second).isEmpty();
        assertThat(third).isEmpty();
        assertThat(systemAdminRoleCount(reload(email))).isEqualTo(1);
    }

    @Test
    void restoresMissingSystemAdminRole() {
        String email = useAccount("boot-role-" + System.nanoTime() + "@potriv.test",
            "BootstrapPassword1!", "Role Admin");
        seeder.reconcile();

        User user = reload(email);
        // deleteAll(...) carries its own transaction; the derived delete query does not.
        userRoleRepository.deleteAll(userRoleRepository.findByUser(user).stream()
            .filter(role -> role.getRole() == AccessRole.SYSTEM_ADMIN)
            .toList());
        assertThat(systemAdminRoleCount(reload(email))).isZero();

        List<String> changed = seeder.reconcile();

        assertThat(changed).contains("role");
        assertThat(systemAdminRoleCount(reload(email))).isEqualTo(1);
    }

    /** No raw password or hash may reach an audit row. */
    @Test
    void auditDetailsNeverContainTheSecret() {
        String password = "SuperSecretBootstrap9!";
        String email = useAccount("boot-secret-" + System.nanoTime() + "@potriv.test",
            password, "Secret Admin");
        seeder.reconcile();
        useAccount(email, password + "-changed", "Secret Admin");
        seeder.reconcile();

        String hash = reload(email).getPasswordHash();
        assertThat(auditEventRepository.findAll())
            .filteredOn(e -> e.getEventType() == SecurityAuditEventType.SYSTEM_ADMIN_BOOTSTRAP_CREATED
                || e.getEventType() == SecurityAuditEventType.SYSTEM_ADMIN_BOOTSTRAP_RECONCILED)
            .isNotEmpty()
            .allSatisfy(event -> {
                assertThat(event.getDetails()).doesNotContain(password);
                assertThat(event.getDetails()).doesNotContain(password + "-changed");
                assertThat(event.getDetails()).doesNotContain(hash);
            });
    }
}
