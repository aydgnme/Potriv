package me.aydgn.potriv.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.identity.entity.AccessAccountStatus;
import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.entity.UserRole;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.identity.repository.UserRoleRepository;
import me.aydgn.potriv.security.entity.SecurityAuditEventType;
import me.aydgn.potriv.security.repository.SecurityAuditEventRepository;

/** Safe user account-operations forms: name edit, activate/suspend, unlock. */
class AdminUserFormIntegrationTest extends AbstractAdminIntegrationTest {

    @Autowired
    private UserRepository userRepository;
    @Autowired
    private UserRoleRepository userRoleRepository;
    @Autowired
    private SecurityAuditEventRepository auditEventRepository;
    @Autowired
    private PasswordEncoder passwordEncoder;

    private UUID normalUser() throws Exception {
        JsonNode admin = registerAdmin(uniqueName("UserOrg"), uniqueEmail("normal"), "Password123!");
        return UUID.fromString(admin.get("userId").asText());
    }

    private UUID seededAdminId() {
        return userRepository.findByEmail(SYSTEM_ADMIN_EMAIL).orElseThrow().getId();
    }

    private User newSystemAdmin() {
        User u = userRepository.save(new User(
            null, uniqueName("Sys"), uniqueEmail("sys"), passwordEncoder.encode("Password123!")));
        userRoleRepository.save(new UserRole(u, AccessRole.SYSTEM_ADMIN));
        return u;
    }

    private boolean audited(SecurityAuditEventType type) {
        return auditEventRepository.findAll().stream().anyMatch(e -> e.getEventType() == type);
    }

    @Test
    void anonymousEditRedirectsToLogin() throws Exception {
        mockMvc.perform(get("/admin/users/" + normalUser() + "/edit"))
            .andExpect(status().is3xxRedirection());
    }

    @Test
    void systemAdminOpensEditForm() throws Exception {
        String html = adminGet("/admin/users/" + normalUser() + "/edit")
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(html).contains("Edit user", "Display name");
    }

    @Test
    void validNameEditPersistsAndAudits() throws Exception {
        UUID id = normalUser();
        String newName = uniqueName("Renamed");
        mockMvc.perform(post("/admin/users/" + id + "/edit")
                .param("name", newName)
                .with(csrf()).session(adminSession()))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrl("/admin/users/" + id));
        assertThat(userRepository.findById(id).orElseThrow().getName()).isEqualTo(newName);
        assertThat(audited(SecurityAuditEventType.ADMIN_USER_PROFILE_UPDATED)).isTrue();
    }

    @Test
    void blankNameReRendersWithError() throws Exception {
        UUID id = normalUser();
        String original = userRepository.findById(id).orElseThrow().getName();
        String html = mockMvc.perform(post("/admin/users/" + id + "/edit")
                .param("name", "   ")
                .with(csrf()).session(adminSession()))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(html).contains("Name is required.");
        assertThat(userRepository.findById(id).orElseThrow().getName()).isEqualTo(original);
    }

    @Test
    void unknownUserReturns404() throws Exception {
        adminGet("/admin/users/" + UUID.randomUUID() + "/edit").andExpect(status().isNotFound());
    }

    @Test
    void editWithoutCsrfIsForbidden() throws Exception {
        mockMvc.perform(post("/admin/users/" + normalUser() + "/edit")
                .param("name", uniqueName("NoCsrf"))
                .session(adminSession()))
            .andExpect(status().isForbidden());
    }

    @Test
    void suspendThenActivateNormalUser() throws Exception {
        UUID id = normalUser();
        mockMvc.perform(post("/admin/users/" + id + "/suspend")
                .with(csrf()).session(adminSession()))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrl("/admin/users/" + id));
        assertThat(userRepository.findById(id).orElseThrow().getStatus())
            .isEqualTo(AccessAccountStatus.SUSPENDED);
        assertThat(audited(SecurityAuditEventType.ADMIN_USER_STATUS_CHANGED)).isTrue();

        mockMvc.perform(post("/admin/users/" + id + "/activate")
                .with(csrf()).session(adminSession()))
            .andExpect(status().is3xxRedirection());
        assertThat(userRepository.findById(id).orElseThrow().getStatus())
            .isEqualTo(AccessAccountStatus.ACTIVE);
    }

    @Test
    void currentAdminCannotSuspendSelf() throws Exception {
        UUID selfId = seededAdminId();
        mockMvc.perform(post("/admin/users/" + selfId + "/suspend")
                .with(csrf()).session(adminSession()))
            .andExpect(status().is3xxRedirection());
        assertThat(userRepository.findById(selfId).orElseThrow().getStatus())
            .isEqualTo(AccessAccountStatus.ACTIVE);
        assertThat(audited(SecurityAuditEventType.ADMIN_USER_ACTION_BLOCKED)).isTrue();
    }

    @Test
    void lastActiveSystemAdminCannotBeSuspended() throws Exception {
        // Establish the admin session while the seeded admin is still active,
        // before we temporarily suspend it below.
        adminSession();
        User newAdmin = newSystemAdmin();
        User seeded = userRepository.findByEmail(SYSTEM_ADMIN_EMAIL).orElseThrow();
        // Make newAdmin the sole active SYSTEM_ADMIN, then restore afterward so the
        // seeded admin can still authenticate in other tests.
        seeded.changeStatus(AccessAccountStatus.SUSPENDED);
        userRepository.save(seeded);
        try {
            mockMvc.perform(post("/admin/users/" + newAdmin.getId() + "/suspend")
                    .with(csrf()).session(adminSession()))
                .andExpect(status().is3xxRedirection());
            assertThat(userRepository.findById(newAdmin.getId()).orElseThrow().getStatus())
                .isEqualTo(AccessAccountStatus.ACTIVE);
        } finally {
            User reloaded = userRepository.findByEmail(SYSTEM_ADMIN_EMAIL).orElseThrow();
            reloaded.changeStatus(AccessAccountStatus.ACTIVE);
            userRepository.save(reloaded);
        }
    }

    @Test
    void unlockClearsLockAndFailedAttempts() throws Exception {
        UUID id = normalUser();
        User user = userRepository.findById(id).orElseThrow();
        user.registerFailedLogin(1, Duration.ofMinutes(15));
        userRepository.save(user);
        assertThat(userRepository.findById(id).orElseThrow().isLoginLocked()).isTrue();

        mockMvc.perform(post("/admin/users/" + id + "/unlock")
                .with(csrf()).session(adminSession()))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrl("/admin/users/" + id));

        User reloaded = userRepository.findById(id).orElseThrow();
        assertThat(reloaded.isLoginLocked()).isFalse();
        assertThat(reloaded.getFailedLoginAttempts()).isZero();
        assertThat(audited(SecurityAuditEventType.ADMIN_USER_UNLOCKED)).isTrue();
    }

    @Test
    void adminSessionDoesNotAuthenticateRestApi() throws Exception {
        mockMvc.perform(get("/projects/managed").session(adminSession()))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void detailRendersNoSensitiveValues() throws Exception {
        UUID id = normalUser();
        String html = adminGet("/admin/users/" + id)
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(html).contains("Account security", "Failed login attempts");
        assertThat(html).doesNotContain("passwordHash", "refreshToken", "normalizedName");
    }
}
