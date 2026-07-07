package me.aydgn.potriv.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;
import me.aydgn.potriv.identity.repository.UserSessionRepository;

class SessionLifecycleIntegrationTest extends AbstractMockMvcIntegrationTest {

    @Autowired
    private UserSessionRepository userSessionRepository;

    @Test
    void sessionListReturnsOnlyOwnSessionsWithCorrectCurrentFlagAndNoSecrets() throws Exception {
        String email = uniqueEmail("session");
        registerAdmin(uniqueName("Org"), email, "Password123!");

        // First login creates an additional session; second is the current one.
        login(email, "Password123!");
        JsonNode current = login(email, "Password123!");
        String currentToken = current.get("accessToken").asText();
        UUID currentSessionId = UUID.fromString(decodeSid(currentToken));

        String response = mockMvc.perform(get("/auth/sessions")
                .header(HttpHeaders.AUTHORIZATION, bearer(currentToken)))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();

        JsonNode sessions = objectMapper.readTree(response);
        assertThat(sessions).hasSize(2);

        int currentCount = 0;
        for (JsonNode session : sessions) {
            // No token or hash material may leak into the session DTO.
            assertThat(session.has("tokenHash")).isFalse();
            assertThat(session.has("refreshToken")).isFalse();
            assertThat(session.has("accessToken")).isFalse();

            boolean isCurrent = session.get("currentSession").asBoolean();
            if (isCurrent) {
                currentCount++;
                assertThat(session.get("sessionId").asText())
                    .isEqualTo(currentSessionId.toString());
            }
        }
        assertThat(currentCount).isEqualTo(1);
    }

    @Test
    void logoutRevokesCurrentSessionAndIsIdempotent() throws Exception {
        String email = uniqueEmail("session");
        registerAdmin(uniqueName("Org"), email, "Password123!");

        JsonNode login = login(email, "Password123!");
        String token = login.get("accessToken").asText();
        String refreshToken = login.get("refreshToken").asText();

        mockMvc.perform(post("/auth/logout")
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isNoContent());

        // Access token from the logged-out session is rejected.
        mockMvc.perform(get("/auth/me")
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isUnauthorized());

        // Refresh token from the logged-out session is rejected.
        mockMvc.perform(post("/auth/refresh")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    java.util.Map.of("refreshToken", refreshToken))))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void logoutIsIdempotentAcrossRepeatedCallsOnSameSession() throws Exception {
        String email = uniqueEmail("session");
        registerAdmin(uniqueName("Org"), email, "Password123!");

        // Two logins: use the first session token for a repeated logout while
        // the account still has a usable second session.
        String firstToken = login(email, "Password123!").get("accessToken").asText();
        UUID firstSessionId = UUID.fromString(decodeSid(firstToken));

        mockMvc.perform(post("/auth/logout")
                .header(HttpHeaders.AUTHORIZATION, bearer(firstToken)))
            .andExpect(status().isNoContent());

        // Revoking the already-revoked session again via DELETE is idempotent.
        String secondToken = login(email, "Password123!").get("accessToken").asText();
        mockMvc.perform(delete("/auth/sessions/" + firstSessionId)
                .header(HttpHeaders.AUTHORIZATION, bearer(secondToken)))
            .andExpect(status().isNoContent());
        mockMvc.perform(delete("/auth/sessions/" + firstSessionId)
                .header(HttpHeaders.AUTHORIZATION, bearer(secondToken)))
            .andExpect(status().isNoContent());
    }

    @Test
    void selectedOwnSessionCanBeRevoked() throws Exception {
        String email = uniqueEmail("session");
        registerAdmin(uniqueName("Org"), email, "Password123!");

        String targetToken = login(email, "Password123!").get("accessToken").asText();
        UUID targetSessionId = UUID.fromString(decodeSid(targetToken));

        String currentToken = login(email, "Password123!").get("accessToken").asText();

        mockMvc.perform(delete("/auth/sessions/" + targetSessionId)
                .header(HttpHeaders.AUTHORIZATION, bearer(currentToken)))
            .andExpect(status().isNoContent());

        assertThat(userSessionRepository.findById(targetSessionId).orElseThrow().isRevoked())
            .isTrue();

        // The revoked session's token no longer authenticates.
        mockMvc.perform(get("/auth/me")
                .header(HttpHeaders.AUTHORIZATION, bearer(targetToken)))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void anotherUsersSessionUuidReturns404() throws Exception {
        String ownerEmail = uniqueEmail("owner");
        registerAdmin(uniqueName("Org"), ownerEmail, "Password123!");
        String ownerToken = login(ownerEmail, "Password123!").get("accessToken").asText();
        UUID ownerSessionId = UUID.fromString(decodeSid(ownerToken));

        String otherEmail = uniqueEmail("other");
        registerAdmin(uniqueName("Org"), otherEmail, "Password123!");
        String otherToken = login(otherEmail, "Password123!").get("accessToken").asText();

        mockMvc.perform(delete("/auth/sessions/" + ownerSessionId)
                .header(HttpHeaders.AUTHORIZATION, bearer(otherToken)))
            .andExpect(status().isNotFound());

        // The owner's session must remain active.
        assertThat(userSessionRepository.findById(ownerSessionId).orElseThrow().isRevoked())
            .isFalse();
    }

    @Test
    void logoutAllRevokesAllOwnedSessionsButNotOtherUsers() throws Exception {
        String ownerEmail = uniqueEmail("owner");
        registerAdmin(uniqueName("Org"), ownerEmail, "Password123!");
        String ownerTokenA = login(ownerEmail, "Password123!").get("accessToken").asText();
        String ownerTokenB = login(ownerEmail, "Password123!").get("accessToken").asText();

        String otherEmail = uniqueEmail("other");
        registerAdmin(uniqueName("Org"), otherEmail, "Password123!");
        String otherToken = login(otherEmail, "Password123!").get("accessToken").asText();

        mockMvc.perform(post("/auth/logout-all")
                .header(HttpHeaders.AUTHORIZATION, bearer(ownerTokenB)))
            .andExpect(status().isNoContent());

        // Both owner sessions are revoked.
        mockMvc.perform(get("/auth/me")
                .header(HttpHeaders.AUTHORIZATION, bearer(ownerTokenA)))
            .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/auth/me")
                .header(HttpHeaders.AUTHORIZATION, bearer(ownerTokenB)))
            .andExpect(status().isUnauthorized());

        // The other user's session is untouched.
        mockMvc.perform(get("/auth/me")
                .header(HttpHeaders.AUTHORIZATION, bearer(otherToken)))
            .andExpect(status().isOk());
    }

    private String decodeSid(String accessToken) throws Exception {
        String payload = accessToken.split("\\.")[1];
        return objectMapper.readTree(java.util.Base64.getUrlDecoder().decode(payload))
            .get("sid").asText();
    }
}
