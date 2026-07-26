package me.aydgn.potriv.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.organization.repository.OrganizationRepository;

/**
 * Organization admin edit form: SYSTEM_ADMIN can rename an organization through
 * a CSRF-protected, redirect-after-POST form; invalid input re-renders with
 * errors; unknown ids 404; anonymous access redirects to login.
 */
class AdminOrganizationFormIntegrationTest extends AbstractAdminIntegrationTest {

    @Autowired
    private OrganizationRepository organizationRepository;

    private UUID seedOrganization() throws Exception {
        JsonNode admin = registerAdmin(uniqueName("OrgForm"), uniqueEmail("orgform"), "Password123!");
        return UUID.fromString(admin.get("organizationId").asText());
    }

    @Test
    void anonymousEditFormRedirectsToLogin() throws Exception {
        UUID orgId = seedOrganization();
        mockMvc.perform(get("/admin/organizations/" + orgId + "/edit"))
            .andExpect(status().is3xxRedirection());
    }

    @Test
    void systemAdminCanOpenEditForm() throws Exception {
        UUID orgId = seedOrganization();
        String html = adminGet("/admin/organizations/" + orgId + "/edit")
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(html).contains("Edit organization", "Save changes");
    }

    @Test
    void validEditUpdatesNameAndRedirects() throws Exception {
        UUID orgId = seedOrganization();
        String newName = uniqueName("Renamed");

        mockMvc.perform(post("/admin/organizations/" + orgId + "/edit")
                .param("name", newName)
                .with(csrf()).session(adminSession()))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrl("/admin/organizations/" + orgId));

        assertThat(organizationRepository.findById(orgId).orElseThrow().getName())
            .isEqualTo(newName);
    }

    @Test
    void blankNameReRendersFormWithError() throws Exception {
        UUID orgId = seedOrganization();
        String original = organizationRepository.findById(orgId).orElseThrow().getName();

        String html = mockMvc.perform(post("/admin/organizations/" + orgId + "/edit")
                .param("name", "   ")
                .with(csrf()).session(adminSession()))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(html).contains("Name is required.");
        // Unchanged.
        assertThat(organizationRepository.findById(orgId).orElseThrow().getName())
            .isEqualTo(original);
    }

    @Test
    void unknownOrganizationReturns404() throws Exception {
        adminGet("/admin/organizations/" + UUID.randomUUID() + "/edit")
            .andExpect(status().isNotFound());
    }

    @Test
    void postWithoutCsrfIsForbidden() throws Exception {
        UUID orgId = seedOrganization();
        mockMvc.perform(post("/admin/organizations/" + orgId + "/edit")
                .param("name", uniqueName("NoCsrf"))
                .session(adminSession()))
            .andExpect(status().isForbidden());
    }

    @Test
    void adminSessionDoesNotAuthenticateRestApi() throws Exception {
        mockMvc.perform(get("/projects/managed").session(adminSession()))
            .andExpect(status().isUnauthorized());
    }
}
