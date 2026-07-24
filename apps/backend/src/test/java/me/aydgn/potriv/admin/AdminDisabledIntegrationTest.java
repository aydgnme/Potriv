package me.aydgn.potriv.admin;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.TestPropertySource;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;

/**
 * With the console disabled (the default), admin routes must answer with an
 * anti-leak 404 rather than reveal that they exist — even with credentials.
 */
@TestPropertySource(properties = "potriv.backend-console.enabled=false")
class AdminDisabledIntegrationTest extends AbstractMockMvcIntegrationTest {

    private static String basic() {
        return "Basic " + Base64.getEncoder().encodeToString(
            "admin:whatever".getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void adminRoutesReturnNotFoundWhenDisabled() throws Exception {
        mockMvc.perform(get("/admin")).andExpect(status().isNotFound());
        mockMvc.perform(get("/admin/users")).andExpect(status().isNotFound());
        mockMvc.perform(get("/admin/users").header(HttpHeaders.AUTHORIZATION, basic()))
            .andExpect(status().isNotFound());
        mockMvc.perform(get("/admin/monitor")).andExpect(status().isNotFound());
    }

    @Test
    void apiRemainsUnchangedWhenAdminDisabled() throws Exception {
        mockMvc.perform(get("/projects/managed")).andExpect(status().isUnauthorized());
    }
}
