package me.aydgn.potriv.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrlPattern;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Locale;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.organization.entity.Organization;
import me.aydgn.potriv.organization.repository.OrganizationRepository;
import me.aydgn.potriv.security.entity.SecurityAuditEventType;
import me.aydgn.potriv.security.repository.SecurityAuditEventRepository;
import me.aydgn.potriv.skill.entity.SkillCategory;
import me.aydgn.potriv.skill.repository.SkillCategoryRepository;

/** Skill-category admin forms: list/detail/create/edit, validation, CSRF, audit. */
class AdminSkillCategoryFormIntegrationTest extends AbstractAdminIntegrationTest {

    @Autowired
    private OrganizationRepository organizationRepository;
    @Autowired
    private SkillCategoryRepository categoryRepository;
    @Autowired
    private SecurityAuditEventRepository auditEventRepository;

    private UUID seedOrganization() throws Exception {
        JsonNode admin = registerAdmin(uniqueName("SkillCatOrg"), uniqueEmail("skillcat"), "Password123!");
        return UUID.fromString(admin.get("organizationId").asText());
    }

    private SkillCategory newCategory(UUID organizationId, String name) {
        Organization org = organizationRepository.findById(organizationId).orElseThrow();
        return categoryRepository.save(
            new SkillCategory(org, name, name.toLowerCase(Locale.ROOT)));
    }

    private boolean audited(SecurityAuditEventType type) {
        return auditEventRepository.findAll().stream().anyMatch(e -> e.getEventType() == type);
    }

    @Test
    void anonymousIsRedirectedToLogin() throws Exception {
        mockMvc.perform(get("/admin/skill-categories"))
            .andExpect(status().is3xxRedirection());
        mockMvc.perform(get("/admin/skill-categories/new"))
            .andExpect(status().is3xxRedirection());
    }

    @Test
    void systemAdminOpensListAndCreateForm() throws Exception {
        adminGet("/admin/skill-categories").andExpect(status().isOk());
        String form = adminGet("/admin/skill-categories/new")
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(form).contains("New skill category", "Organization", "Create category");
    }

    @Test
    void validCreatePersistsAndRedirects() throws Exception {
        UUID orgId = seedOrganization();
        String name = uniqueName("Programming");
        mockMvc.perform(post("/admin/skill-categories")
                .param("organizationId", orgId.toString())
                .param("name", name)
                .with(csrf()).session(adminSession()))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrlPattern("/admin/skill-categories/*"));
        assertThat(categoryRepository.findByOrganization_IdAndNormalizedName(
            orgId, name.toLowerCase(Locale.ROOT))).isPresent();
        assertThat(audited(SecurityAuditEventType.ADMIN_SKILL_CATEGORY_CREATED)).isTrue();
    }

    @Test
    void validEditRenamesAndRedirects() throws Exception {
        UUID orgId = seedOrganization();
        SkillCategory cat = newCategory(orgId, uniqueName("Databases"));
        String newName = uniqueName("DataStores");
        mockMvc.perform(post("/admin/skill-categories/" + cat.getId() + "/edit")
                .param("name", newName)
                .with(csrf()).session(adminSession()))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrl("/admin/skill-categories/" + cat.getId()));
        assertThat(categoryRepository.findById(cat.getId()).orElseThrow().getName())
            .isEqualTo(newName);
        assertThat(audited(SecurityAuditEventType.ADMIN_SKILL_CATEGORY_UPDATED)).isTrue();
    }

    @Test
    void blankNameReRendersWithError() throws Exception {
        UUID orgId = seedOrganization();
        String html = mockMvc.perform(post("/admin/skill-categories")
                .param("organizationId", orgId.toString())
                .param("name", "   ")
                .with(csrf()).session(adminSession()))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(html).contains("Name is required.");
    }

    @Test
    void duplicateNameBlocked() throws Exception {
        UUID orgId = seedOrganization();
        String name = uniqueName("Cloud");
        newCategory(orgId, name);
        String html = mockMvc.perform(post("/admin/skill-categories")
                .param("organizationId", orgId.toString())
                .param("name", name)
                .with(csrf()).session(adminSession()))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(html).contains("already exists");
    }

    @Test
    void unknownOrganizationBlocked() throws Exception {
        String html = mockMvc.perform(post("/admin/skill-categories")
                .param("organizationId", UUID.randomUUID().toString())
                .param("name", uniqueName("Ghost"))
                .with(csrf()).session(adminSession()))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(html).contains("no longer exists");
    }

    @Test
    void unknownCategoryReturns404() throws Exception {
        adminGet("/admin/skill-categories/" + UUID.randomUUID())
            .andExpect(status().isNotFound());
        adminGet("/admin/skill-categories/" + UUID.randomUUID() + "/edit")
            .andExpect(status().isNotFound());
    }

    @Test
    void postWithoutCsrfIsForbidden() throws Exception {
        UUID orgId = seedOrganization();
        mockMvc.perform(post("/admin/skill-categories")
                .param("organizationId", orgId.toString())
                .param("name", uniqueName("NoCsrf"))
                .session(adminSession()))
            .andExpect(status().isForbidden());
    }

    @Test
    void detailRendersNoSensitiveValues() throws Exception {
        UUID orgId = seedOrganization();
        SkillCategory cat = newCategory(orgId, uniqueName("Security"));
        String html = adminGet("/admin/skill-categories/" + cat.getId())
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(html).contains(cat.getName(), "General", "Metadata");
        assertThat(html).doesNotContain("passwordHash", "normalizedName", "refreshToken");
    }
}
