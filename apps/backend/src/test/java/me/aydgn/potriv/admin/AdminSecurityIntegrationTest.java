package me.aydgn.potriv.admin;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;

/**
 * Admin UI security: the shared {@code /admin/**} Basic-auth boundary protects
 * the admin pages and the monitor alike, while the JWT-guarded API is unchanged.
 */
class AdminSecurityIntegrationTest extends AbstractAdminIntegrationTest {

    @Test
    void adminPagesRequireCredentials() throws Exception {
        mockMvc.perform(get("/admin")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/admin/users")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/admin/users")
                .header(HttpHeaders.AUTHORIZATION, basic("admin", "wrong")))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void validCredentialsReachAdminPages() throws Exception {
        adminGet("/admin").andExpect(status().isOk());
        adminGet("/admin/users").andExpect(status().isOk());
    }

    @Test
    void monitorRemainsProtectedAndReachable() throws Exception {
        mockMvc.perform(get("/admin/monitor")).andExpect(status().isUnauthorized());
        adminGet("/admin/monitor").andExpect(status().isOk());
    }

    @Test
    void apiAuthenticationIsUnchanged() throws Exception {
        // A protected API endpoint still rejects unauthenticated access, and the
        // admin Basic credentials grant nothing on the JWT-guarded API.
        mockMvc.perform(get("/projects/managed")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/projects/managed")
                .header(HttpHeaders.AUTHORIZATION, basic("admin", "admin-console-password")))
            .andExpect(status().isUnauthorized());
        // The public health endpoint is not behind the admin/monitor chain
        // (its reported status depends on infra, so it is not asserted here).
        mockMvc.perform(get("/actuator/health"))
            .andExpect(result -> {
                int status = result.getResponse().getStatus();
                if (status == 401 || status == 403) {
                    throw new AssertionError("Health must not require auth, got " + status);
                }
            });
    }
}
