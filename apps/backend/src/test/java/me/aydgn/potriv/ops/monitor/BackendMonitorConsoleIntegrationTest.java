package me.aydgn.potriv.ops.monitor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrlPattern;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpSession;

import me.aydgn.potriv.admin.AbstractAdminIntegrationTest;

/**
 * The monitor console is preserved under the admin session boundary: anonymous
 * requests redirect to the admin login, a SYSTEM_ADMIN session renders it, and
 * no secrets leak.
 */
class BackendMonitorConsoleIntegrationTest extends AbstractAdminIntegrationTest {

    @Test
    void anonymousMonitorRedirectsToLogin() throws Exception {
        mockMvc.perform(get("/admin/monitor"))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrlPattern("**/admin/login"));
    }

    @Test
    void systemAdminSessionRendersMonitorWithoutSecrets() throws Exception {
        MockHttpSession session = adminSession();
        String html = mockMvc.perform(get("/admin/monitor").session(session))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith("text/html"))
            .andReturn().getResponse().getContentAsString();

        assertThat(html).contains(
            "Potriv Backend Monitor", "Generated at", "Health", "Runtime", "Database",
            "Flyway", "Security configuration", "Readiness checklist",
            "/api/actuator/health");
        assertThat(html).doesNotContain(
            "change-this-secret", "passwordHash", "refreshToken", "accessToken",
            "TestAdminPassword");
    }

    @Test
    void bearerApiBehaviorIsUnchangedWhileConsoleIsEnabled() throws Exception {
        mockMvc.perform(get("/projects/managed")).andExpect(status().isUnauthorized());
        // An admin session grants nothing on the JWT-guarded API.
        mockMvc.perform(get("/projects/managed").session(adminSession()))
            .andExpect(status().isUnauthorized());
    }
}
