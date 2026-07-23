package me.aydgn.potriv.ops.monitor;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;

/**
 * Default posture: the monitor console is disabled and the route answers with
 * an anti-leak 404, while the existing API security is untouched.
 */
class BackendMonitorDisabledIntegrationTest extends AbstractMockMvcIntegrationTest {

    @Test
    void disabledConsoleAnswersNotFound() throws Exception {
        mockMvc.perform(get("/admin/monitor")).andExpect(status().isNotFound());
    }

    @Test
    void apiSecurityIsUnchanged() throws Exception {
        // The monitor chain matches only /admin/**; the JWT chain still guards
        // the API exactly as before — a protected endpoint stays 401.
        mockMvc.perform(get("/projects/managed")).andExpect(status().isUnauthorized());
        // The public health endpoint is still reachable without authentication
        // (its reported status depends on infra and is not asserted here).
        mockMvc.perform(get("/actuator/health"))
            .andExpect(result -> {
                int status = result.getResponse().getStatus();
                if (status == 401 || status == 403) {
                    throw new AssertionError(
                        "Health endpoint must not require authentication but got " + status);
                }
            });
    }
}
