package me.aydgn.potriv.admin;

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

class AdminDetailPagesIntegrationTest extends AbstractAdminIntegrationTest {

    @Test
    void userAndOrganizationDetailsRender() throws Exception {
        String email = uniqueEmail("detail-admin");
        JsonNode admin = registerAdmin(uniqueName("DetailOrg"), email, "Password123!");
        UUID userId = UUID.fromString(admin.get("userId").asText());
        UUID orgId = UUID.fromString(admin.get("organizationId").asText());

        String userHtml = adminGet("/admin/users/" + userId)
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(userHtml).contains(email, "General", "Roles", "Metadata");
        assertThat(userHtml).doesNotContain("passwordHash", "lockedUntil", "failedLogin");

        adminGet("/admin/organizations/" + orgId).andExpect(status().isOk());
    }

    @Test
    void projectDetailRendersThroughRealFlow() throws Exception {
        String adminEmail = uniqueEmail("proj-admin");
        JsonNode admin = registerAdmin(uniqueName("ProjOrg"), adminEmail, "Password123!");
        String adminToken = loginForAccessToken(adminEmail, "Password123!");
        String inviteToken = extractInviteToken(admin.get("employeeInviteUrl").asText());

        // A dedicated employee is promoted to PROJECT_MANAGER, then creates a
        // project through the real API.
        String pmEmail = uniqueEmail("pm");
        JsonNode pm = registerEmployee(inviteToken, pmEmail, "Password123!");
        UUID pmUserId = UUID.fromString(pm.get("userId").asText());
        mockMvc.perform(patch("/users/" + pmUserId + "/roles")
                .header(HttpHeaders.AUTHORIZATION, bearer(adminToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    Map.of("roles", List.of("EMPLOYEE", "PROJECT_MANAGER")))))
            .andExpect(status().isOk());
        String pmToken = loginForAccessToken(pmEmail, "Password123!");

        Map<String, Object> project = Map.of(
            "name", "Admin Detail Project",
            "period", "FIXED",
            "startDate", "2026-08-01",
            "deadlineDate", "2026-12-31",
            "status", "STARTING",
            "generalDescription", "Created for the admin detail test");
        String created = mockMvc.perform(post("/projects")
                .header(HttpHeaders.AUTHORIZATION, bearer(pmToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(project)))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        UUID projectId = UUID.fromString(objectMapper.readTree(created).get("projectId").asText());

        String html = adminGet("/admin/projects/" + projectId)
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(html).contains("Admin Detail Project", "Technology Stack",
            "Active Members", "Metadata");
    }

    @Test
    void unknownIdRendersAdminStyledNotFound() throws Exception {
        String html = mockMvc.perform(get("/admin/users/" + UUID.randomUUID())
                .header(HttpHeaders.AUTHORIZATION, basic(ADMIN_USER, ADMIN_PASSWORD)))
            .andExpect(status().isNotFound())
            .andReturn().getResponse().getContentAsString();
        assertThat(html).contains("404", "Potriv Admin");
    }
}
