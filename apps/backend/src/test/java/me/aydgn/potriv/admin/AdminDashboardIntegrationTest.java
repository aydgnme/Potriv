package me.aydgn.potriv.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;

class AdminDashboardIntegrationTest extends AbstractAdminIntegrationTest {

    @Test
    void dashboardRendersSafeCountLabels() throws Exception {
        // Seed at least one organization + user so counts are non-trivial.
        registerAdmin(uniqueName("Org"), uniqueEmail("admin"), "Password123!");

        String html = adminGet("/admin")
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith("text/html"))
            .andReturn().getResponse().getContentAsString();

        assertThat(html).contains(
            "Dashboard", "Users", "Organizations", "Departments", "Projects",
            "Active Allocations", "Pending Assignment Proposals", "Audit Events");
        assertThat(html).doesNotContain(
            "passwordHash", "change-this-secret", "admin-console-password",
            "refreshToken", "accessToken");
    }
}
