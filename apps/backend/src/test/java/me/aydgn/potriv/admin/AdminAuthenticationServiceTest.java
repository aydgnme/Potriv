package me.aydgn.potriv.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;

import me.aydgn.potriv.AbstractIntegrationTest;
import me.aydgn.potriv.admin.security.AdminAuthenticationService;
import me.aydgn.potriv.identity.entity.AccessAccountStatus;
import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.entity.UserRole;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.identity.repository.UserRoleRepository;
import me.aydgn.potriv.security.entity.SecurityAuditEvent;
import me.aydgn.potriv.security.entity.SecurityAuditEventType;
import me.aydgn.potriv.security.repository.SecurityAuditEventRepository;

/**
 * Admin credential verification mirrors the JWT login's account-status,
 * lockout, and audit semantics.
 */
class AdminAuthenticationServiceTest extends AbstractIntegrationTest {

    @Autowired
    private AdminAuthenticationService authenticationService;
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private UserRoleRepository userRoleRepository;
    @Autowired
    private PasswordEncoder passwordEncoder;
    @Autowired
    private SecurityAuditEventRepository auditEventRepository;

    private String createSystemAdmin(String password, AccessAccountStatus status) {
        String email = "sysadmin-" + UUID.randomUUID() + "@ex.com";
        User user = new User(null, "Sys Admin", email, passwordEncoder.encode(password));
        user.changeStatus(status);
        userRepository.save(user);
        userRoleRepository.save(new UserRole(user, AccessRole.SYSTEM_ADMIN));
        return email;
    }

    @Test
    void wrongPasswordIncrementsFailedAttempts() {
        String email = createSystemAdmin("Password123!", AccessAccountStatus.ACTIVE);
        assertThatThrownBy(() -> authenticationService.authenticate(email, "wrong", "ua", "ip"))
            .isInstanceOf(BadCredentialsException.class)
            .hasMessage("Invalid email or password.");
        assertThat(userRepository.findByEmail(email).orElseThrow().getFailedLoginAttempts())
            .isEqualTo(1);
    }

    @Test
    void repeatedWrongPasswordLocksAccount() {
        String email = createSystemAdmin("Password123!", AccessAccountStatus.ACTIVE);
        for (int i = 0; i < 5; i++) {
            assertThatThrownBy(() -> authenticationService.authenticate(email, "wrong", "ua", "ip"))
                .isInstanceOf(BadCredentialsException.class);
        }
        assertThat(userRepository.findByEmail(email).orElseThrow().isLoginLocked()).isTrue();
        // A locked account is rejected even with the correct password.
        assertThatThrownBy(() ->
            authenticationService.authenticate(email, "Password123!", "ua", "ip"))
            .isInstanceOf(BadCredentialsException.class);
    }

    @Test
    void inactiveSystemAdminCannotAuthenticate() {
        String email = createSystemAdmin("Password123!", AccessAccountStatus.SUSPENDED);
        assertThatThrownBy(() ->
            authenticationService.authenticate(email, "Password123!", "ua", "ip"))
            .isInstanceOf(BadCredentialsException.class);
    }

    @Test
    void successResetsFailedAttemptsAndAudits() {
        String email = createSystemAdmin("Password123!", AccessAccountStatus.ACTIVE);
        assertThatThrownBy(() -> authenticationService.authenticate(email, "wrong", "ua", "ip"))
            .isInstanceOf(BadCredentialsException.class);

        assertThatCode(() ->
            authenticationService.authenticate(email, "Password123!", "ua", "ip"))
            .doesNotThrowAnyException();

        User reloaded = userRepository.findByEmail(email).orElseThrow();
        assertThat(reloaded.getFailedLoginAttempts()).isZero();
        assertThat(reloaded.isLoginLocked()).isFalse();

        boolean audited = auditEventRepository.findAll().stream().anyMatch(event ->
            event.getEventType() == SecurityAuditEventType.LOGIN_SUCCEEDED
                && email.equals(event.getNormalizedEmail()));
        assertThat(audited).isTrue();
    }

    @Test
    void nonSystemAdminIsRejected() {
        String email = "emp-" + UUID.randomUUID() + "@ex.com";
        User user = userRepository.save(
            new User(null, "Emp", email, passwordEncoder.encode("Password123!")));
        userRoleRepository.save(new UserRole(user, AccessRole.EMPLOYEE));

        assertThatThrownBy(() ->
            authenticationService.authenticate(email, "Password123!", "ua", "ip"))
            .isInstanceOf(BadCredentialsException.class);
    }
}
