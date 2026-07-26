package me.aydgn.potriv.admin;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestBuilders.formLogin;
import static org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.authenticated;
import static org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.unauthenticated;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import me.aydgn.potriv.identity.entity.AccessAccountStatus;
import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.entity.UserRole;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.identity.repository.UserRoleRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;

/**
 * Session-login rejection paths: wrong password, unknown email, inactive and
 * non-SYSTEM_ADMIN users, plus anonymous access to admin static assets.
 */
class AdminSessionSecurityIntegrationTest extends AbstractAdminIntegrationTest {

    @Autowired
    private UserRepository userRepository;
    @Autowired
    private UserRoleRepository userRoleRepository;
    @Autowired
    private PasswordEncoder passwordEncoder;

    @Test
    void wrongPasswordDoesNotAuthenticate() throws Exception {
        mockMvc.perform(formLogin("/admin/login")
                .user(SYSTEM_ADMIN_EMAIL).password("definitely-wrong"))
            .andExpect(unauthenticated());
    }

    @Test
    void unknownEmailDoesNotAuthenticate() throws Exception {
        mockMvc.perform(formLogin("/admin/login")
                .user("nobody-" + UUID.randomUUID() + "@ex.com").password("whatever"))
            .andExpect(unauthenticated());
    }

    @Test
    @Transactional
    void nonSystemAdminCannotAuthenticate() throws Exception {
        // A user with a valid password but only EMPLOYEE must be rejected.
        String email = "employee-" + UUID.randomUUID() + "@ex.com";
        User user = userRepository.save(new User(null, "Employee", email,
            passwordEncoder.encode("Password123!")));
        userRoleRepository.save(new UserRole(user, AccessRole.EMPLOYEE));

        mockMvc.perform(formLogin("/admin/login").user(email).password("Password123!"))
            .andExpect(unauthenticated());
    }

    @Test
    @Transactional
    void inactiveSystemAdminCannotAuthenticate() throws Exception {
        String email = "suspended-admin-" + UUID.randomUUID() + "@ex.com";
        User user = new User(null, "Suspended Admin", email,
            passwordEncoder.encode("Password123!"));
        user.changeStatus(AccessAccountStatus.SUSPENDED);
        userRepository.save(user);
        userRoleRepository.save(new UserRole(user, AccessRole.SYSTEM_ADMIN));

        mockMvc.perform(formLogin("/admin/login").user(email).password("Password123!"))
            .andExpect(unauthenticated());
    }

    @Test
    void seededSystemAdminCanAuthenticate() throws Exception {
        mockMvc.perform(formLogin("/admin/login")
                .user(SYSTEM_ADMIN_EMAIL).password(SYSTEM_ADMIN_PASSWORD))
            .andExpect(authenticated());
    }

    @Test
    void adminStaticAssetsLoadAnonymously() throws Exception {
        mockMvc.perform(get("/admin/css/admin.css")).andExpect(status().isOk());
        mockMvc.perform(get("/admin/js/admin.js")).andExpect(status().isOk());
    }
}
