package me.aydgn.potriv.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;

class AdminListPagesIntegrationTest extends AbstractAdminIntegrationTest {

    @Test
    void listPagesRenderHtmlWithoutSensitiveValues() throws Exception {
        String email = uniqueEmail("list-admin");
        JsonNode admin = registerAdmin(uniqueName("ListOrg"), email, "Password123!");

        for (String path : new String[] {
            "/admin/users", "/admin/organizations", "/admin/departments",
            "/admin/projects", "/admin/allocations", "/admin/invitations",
            "/admin/audit-logs"}) {
            String html = adminGet(path)
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("text/html"))
                .andReturn().getResponse().getContentAsString();
            assertThat(html).doesNotContain(
                "passwordHash", "refreshToken", "accessToken", "normalizedName",
                "hibernateLazyInitializer", "admin-console-password");
        }

        // The seeded admin user appears in the users list.
        assertThat(adminGet("/admin/users").andReturn().getResponse().getContentAsString())
            .contains(email);
    }

    @Test
    void usersSearchQueryIsRetainedInTheForm() throws Exception {
        String html = mockMvc.perform(authorized(get("/admin/users").param("q", "mert")))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        // The search box keeps the query so it survives pagination/sorting.
        assertThat(html).contains("value=\"mert\"");
    }

    @Test
    void invalidProjectStatusFilterIsIgnoredWithMessage() throws Exception {
        String html = mockMvc.perform(authorized(get("/admin/projects").param("status", "BANANA")))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(html).contains("Unknown status");
    }
}
