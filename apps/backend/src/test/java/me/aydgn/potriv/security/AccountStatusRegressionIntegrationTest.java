package me.aydgn.potriv.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.JsonNode;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import me.aydgn.potriv.AbstractMockMvcIntegrationTest;
import me.aydgn.potriv.common.exception.BadRequestException;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.identity.entity.AccessAccountStatus;
import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.entity.UserRole;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.identity.repository.UserRoleRepository;
import me.aydgn.potriv.identity.repository.UserSessionRepository;
import me.aydgn.potriv.identity.service.UserAccountStatusService;

class AccountStatusRegressionIntegrationTest extends AbstractMockMvcIntegrationTest {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private UserRoleRepository userRoleRepository;

    @Autowired
    private UserAccountStatusService userAccountStatusService;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @PersistenceContext
    private EntityManager entityManager;

    @Autowired
    private UserSessionRepository userSessionRepository;

    @Test
    void activeUserAuthenticatesAndSuspendedCannotLoginOrRefreshOrUseAccessToken()
        throws Exception {
        String email = uniqueEmail("status");
        JsonNode admin = registerAdmin(uniqueName("Org"), email, "Password123!");
        UUID userId = UUID.fromString(admin.get("userId").asText());

        JsonNode login = login(email, "Password123!");
        String accessToken = login.get("accessToken").asText();
        String refreshToken = login.get("refreshToken").asText();

        mockMvc.perform(get("/auth/me")
                .header(HttpHeaders.AUTHORIZATION, bearer(accessToken)))
            .andExpect(status().isOk());

        patchStatus(systemAdminAccessToken(), userId, "SUSPENDED")
            .andExpect(status().isOk());

        // Suspended user cannot use an existing access token, refresh, or login.
        mockMvc.perform(get("/auth/me")
                .header(HttpHeaders.AUTHORIZATION, bearer(accessToken)))
            .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/auth/refresh")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("refreshToken", refreshToken))))
            .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    Map.of("email", email, "password", "Password123!"))))
            .andExpect(status().isBadRequest());
    }

    @Test
    void disabledUserCannotLogin() throws Exception {
        String email = uniqueEmail("status");
        JsonNode admin = registerAdmin(uniqueName("Org"), email, "Password123!");
        UUID userId = UUID.fromString(admin.get("userId").asText());

        patchStatus(systemAdminAccessToken(), userId, "DISABLED").andExpect(status().isOk());

        mockMvc.perform(post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    Map.of("email", email, "password", "Password123!"))))
            .andExpect(status().isBadRequest());
    }

    @Test
    void statusChangeRevokesExistingSessions() throws Exception {
        String email = uniqueEmail("status");
        JsonNode admin = registerAdmin(uniqueName("Org"), email, "Password123!");
        UUID userId = UUID.fromString(admin.get("userId").asText());

        String accessToken = login(email, "Password123!").get("accessToken").asText();

        patchStatus(systemAdminAccessToken(), userId, "SUSPENDED").andExpect(status().isOk());

        assertThat(userSessionRepository.findByUserIdOrderByCreatedAtDesc(userId))
            .isNotEmpty()
            .allMatch(session -> session.getRevokedAt() != null);

        mockMvc.perform(get("/auth/me")
                .header(HttpHeaders.AUTHORIZATION, bearer(accessToken)))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void nonSystemAdminCannotChangeAccountStatus() throws Exception {
        String adminEmail = uniqueEmail("admin");
        JsonNode admin = registerAdmin(uniqueName("Org"), adminEmail, "Password123!");
        UUID userId = UUID.fromString(admin.get("userId").asText());
        String orgAdminToken = loginForAccessToken(adminEmail, "Password123!");

        patchStatus(orgAdminToken, userId, "SUSPENDED")
            .andExpect(status().isForbidden());
    }

    @Test
    void systemAdminCannotSuspendOwnCurrentAccount() throws Exception {
        User systemAdmin = userRepository.findByEmail(SYSTEM_ADMIN_EMAIL).orElseThrow();

        patchStatus(systemAdminAccessToken(), systemAdmin.getId(), "DISABLED")
            .andExpect(status().isBadRequest());
    }

    @Test
    @Transactional
    void lastActiveSystemAdminCannotBeSuspendedOrDisabled() {
        // Build an isolated last-admin scenario: a fresh SYSTEM_ADMIN target and
        // no other ACTIVE SYSTEM_ADMIN. The @Transactional method rolls every
        // mutation back, so the seeded admin stays usable for other tests. The
        // actor is a different user, so the self-account guard cannot fire and
        // only the last-active-system-admin invariant is exercised.
        User target = userRepository.save(new User(
            null, "Last Admin", uniqueEmail("last-admin"), passwordEncoder.encode("Password123!")));
        userRoleRepository.save(new UserRole(target, AccessRole.SYSTEM_ADMIN));

        List<User> otherActiveSystemAdmins = entityManager.createQuery(
                "select distinct ur.user from UserRole ur "
                    + "where ur.role = :role and ur.user.status = :status "
                    + "and ur.user.id <> :targetId",
                User.class)
            .setParameter("role", AccessRole.SYSTEM_ADMIN)
            .setParameter("status", AccessAccountStatus.ACTIVE)
            .setParameter("targetId", target.getId())
            .getResultList();
        otherActiveSystemAdmins.forEach(user -> user.changeStatus(AccessAccountStatus.SUSPENDED));
        entityManager.flush();

        // Precondition: the target is genuinely the only active SYSTEM_ADMIN.
        assertThat(userRoleRepository.countByRoleAndUser_StatusAndUser_IdNot(
            AccessRole.SYSTEM_ADMIN, AccessAccountStatus.ACTIVE, target.getId())).isZero();

        authenticateAs(UUID.randomUUID());
        try {
            assertThatThrownBy(() -> userAccountStatusService.changeStatus(
                target.getId(), AccessAccountStatus.SUSPENDED))
                .isInstanceOf(BadRequestException.class);
            assertThatThrownBy(() -> userAccountStatusService.changeStatus(
                target.getId(), AccessAccountStatus.DISABLED))
                .isInstanceOf(BadRequestException.class);

            assertThat(userRepository.findById(target.getId()).orElseThrow().getStatus())
                .isEqualTo(AccessAccountStatus.ACTIVE);
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    private void authenticateAs(UUID actorUserId) {
        AuthenticatedUser actor = new AuthenticatedUser(
            actorUserId, UUID.randomUUID(), null, "actor@potriv.test", List.of());
        SecurityContextHolder.getContext().setAuthentication(
            new UsernamePasswordAuthenticationToken(actor, null, List.of()));
    }

    @Test
    void reactivatedUserCanLoginButReceivesNoRestoredOldSessions() throws Exception {
        String email = uniqueEmail("status");
        JsonNode admin = registerAdmin(uniqueName("Org"), email, "Password123!");
        UUID userId = UUID.fromString(admin.get("userId").asText());

        login(email, "Password123!");

        String systemAdminToken = systemAdminAccessToken();
        patchStatus(systemAdminToken, userId, "SUSPENDED").andExpect(status().isOk());
        patchStatus(systemAdminToken, userId, "ACTIVE").andExpect(status().isOk());

        // Login works again, but every prior session remains revoked.
        login(email, "Password123!");

        assertThat(userSessionRepository.findByUserIdOrderByCreatedAtDesc(userId))
            .filteredOn(session -> session.getRevokedAt() != null)
            .isNotEmpty();
    }

    private ResultActions patchStatus(String accessToken, UUID userId, String status)
        throws Exception {
        return mockMvc.perform(patch("/admin/users/" + userId + "/status")
            .header(HttpHeaders.AUTHORIZATION, bearer(accessToken))
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(Map.of("status", status))));
    }
}
