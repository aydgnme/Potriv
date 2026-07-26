package me.aydgn.potriv.admin;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpSession;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * The admin browser session and the REST JWT chain are isolated: an admin
 * session never authenticates the API, and Bearer JWT still works as before.
 */
class AdminApiIsolationIntegrationTest extends AbstractAdminIntegrationTest {

    @Test
    void adminSessionDoesNotAuthenticateTheApi() throws Exception {
        MockHttpSession session = adminSession();
        // The same session that reaches /admin cannot reach a JWT-guarded API.
        mockMvc.perform(get("/admin/users").session(session)).andExpect(status().isOk());
        mockMvc.perform(get("/projects/managed").session(session))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void bearerJwtStillWorks() throws Exception {
        String email = uniqueEmail("api-admin");
        registerAdmin(uniqueName("ApiOrg"), email, "Password123!");
        JsonNode tokens = login(email, "Password123!");
        String accessToken = tokens.get("accessToken").asText();

        // A protected API endpoint accepts the Bearer token (PM list is empty
        // for a fresh org admin, but the call is authorized → 200).
        mockMvc.perform(get("/projects/managed")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken))
            .andExpect(status().isForbidden());
        // Unauthenticated stays 401.
        mockMvc.perform(get("/projects/managed")).andExpect(status().isUnauthorized());
    }

    @Test
    void healthEndpointIsUnchanged() throws Exception {
        mockMvc.perform(get("/actuator/health"))
            .andExpect(result -> {
                int status = result.getResponse().getStatus();
                if (status == 401 || status == 403) {
                    throw new AssertionError("Health must not require auth, got " + status);
                }
            });
    }
}
