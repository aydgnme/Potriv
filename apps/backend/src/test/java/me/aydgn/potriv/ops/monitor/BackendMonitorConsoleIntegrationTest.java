package me.aydgn.potriv.ops.monitor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.TestPropertySource;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;

/**
 * Enabled console: HTTP Basic boundary and the rendered page. The credentials
 * come from test properties only — no machine environment involved.
 */
@TestPropertySource(properties = {
    "potriv.backend-console.enabled=true",
    "potriv.backend-console.username=monitor-admin",
    "potriv.backend-console.password=monitor-test-password"
})
class BackendMonitorConsoleIntegrationTest extends AbstractMockMvcIntegrationTest {

    private static String basic(String username, String password) {
        return "Basic " + Base64.getEncoder().encodeToString(
            (username + ":" + password).getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void missingAndInvalidCredentialsAreRejected() throws Exception {
        mockMvc.perform(get("/admin/monitor")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/admin/monitor")
                .header(HttpHeaders.AUTHORIZATION, basic("monitor-admin", "wrong")))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void validCredentialsRenderTheMonitorPage() throws Exception {
        String html = mockMvc.perform(get("/admin/monitor")
                .header(HttpHeaders.AUTHORIZATION,
                    basic("monitor-admin", "monitor-test-password")))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith("text/html"))
            .andReturn().getResponse().getContentAsString();

        // Major sections and the generated timestamp are present.
        assertThat(html).contains(
            "Potriv Backend Monitor", "Generated at", "Health", "Runtime", "Database",
            "Flyway", "Security configuration", "Readiness checklist",
            "/api/actuator/health");

        // Nothing sensitive leaks into the page: no JWT secret value, no
        // console password, no credentialed JDBC URL parts, no token fields.
        assertThat(html).doesNotContain(
            "change-this-secret", "monitor-test-password", "passwordHash",
            "refreshToken", "accessToken", "TestAdminPassword");
    }

    @Test
    void bearerApiBehaviorIsUnchangedWhileConsoleIsEnabled() throws Exception {
        mockMvc.perform(get("/projects/managed")).andExpect(status().isUnauthorized());
        // The console's basic credentials grant nothing on the JWT-guarded API.
        mockMvc.perform(get("/projects/managed")
                .header(HttpHeaders.AUTHORIZATION,
                    basic("monitor-admin", "monitor-test-password")))
            .andExpect(status().isUnauthorized());
    }
}
