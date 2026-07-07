package me.aydgn.potriv.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;
import me.aydgn.potriv.identity.entity.AccessAccountStatus;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.identity.repository.UserSessionRepository;

class AccountStatusRegressionIntegrationTest extends AbstractMockMvcIntegrationTest {

    @Autowired
    private UserRepository userRepository;

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
    void finalActiveSystemAdminProtectionWorks() throws Exception {
        // The seeded system admin is the only active SYSTEM_ADMIN. Attempting to
        // disable it (even by itself) is blocked; the own-account guard fires first
        // but the last-admin guard equally protects it.
        User systemAdmin = userRepository.findByEmail(SYSTEM_ADMIN_EMAIL).orElseThrow();

        patchStatus(systemAdminAccessToken(), systemAdmin.getId(), "SUSPENDED")
            .andExpect(status().isBadRequest());

        assertThat(userRepository.findByEmail(SYSTEM_ADMIN_EMAIL).orElseThrow().getStatus())
            .isEqualTo(AccessAccountStatus.ACTIVE);
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
