package me.aydgn.potriv.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;

/**
 * End-to-end regression: exercises the full authentication surface in one
 * ordered sequence to prove the flows still interoperate after all auth work.
 */
class FullAuthRegressionIntegrationTest extends AbstractMockMvcIntegrationTest {

    @Test
    void fullAuthenticationJourneyWorksEndToEnd() throws Exception {
        // 1. Admin registration
        String adminEmail = uniqueEmail("admin");
        JsonNode admin = registerAdmin(uniqueName("Org"), adminEmail, "Password123!");
        String inviteToken = extractInviteToken(admin.get("employeeInviteUrl").asText());

        // 2. Employee invite registration
        String employeeEmail = uniqueEmail("employee");
        JsonNode employee = registerEmployee(inviteToken, employeeEmail, "Password123!");
        UUID employeeId = UUID.fromString(employee.get("userId").asText());

        // 3. Login
        JsonNode login = login(adminEmail, "Password123!");
        String accessToken = login.get("accessToken").asText();
        String refreshToken = login.get("refreshToken").asText();

        // 4. Me
        mockMvc.perform(get("/auth/me")
                .header(HttpHeaders.AUTHORIZATION, bearer(accessToken)))
            .andExpect(status().isOk());

        // 5. Refresh
        JsonNode refreshed = refresh(refreshToken);
        String rotatedAccessToken = refreshed.get("accessToken").asText();
        assertThat(rotatedAccessToken).isNotBlank();

        // 6. Session list
        String sessions = mockMvc.perform(get("/auth/sessions")
                .header(HttpHeaders.AUTHORIZATION, bearer(rotatedAccessToken)))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(objectMapper.readTree(sessions)).isNotEmpty();

        // 7. Role management (admin manages the employee)
        mockMvc.perform(patch("/users/" + employeeId + "/roles")
                .header(HttpHeaders.AUTHORIZATION, bearer(rotatedAccessToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    Map.of("roles", List.of("EMPLOYEE", "DEPARTMENT_MANAGER")))))
            .andExpect(status().isOk());

        // 8. Logout
        mockMvc.perform(post("/auth/logout")
                .header(HttpHeaders.AUTHORIZATION, bearer(rotatedAccessToken)))
            .andExpect(status().isNoContent());

        // After logout the session no longer authenticates.
        mockMvc.perform(get("/auth/me")
                .header(HttpHeaders.AUTHORIZATION, bearer(rotatedAccessToken)))
            .andExpect(status().isUnauthorized());
    }
}
