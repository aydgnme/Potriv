package me.aydgn.potriv.skill;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.organization.entity.Organization;
import me.aydgn.potriv.organization.repository.OrganizationRepository;
import me.aydgn.potriv.skill.entity.SkillCategory;
import me.aydgn.potriv.skill.repository.SkillCategoryRepository;

class SkillCategoryCatalogIntegrationTest extends AbstractSkillIntegrationTest {

    @Autowired
    private SkillCategoryRepository skillCategoryRepository;

    @Autowired
    private OrganizationRepository organizationRepository;

    @Test
    void departmentManagerCreatesCategoryWithUuidId() throws Exception {
        Manager manager = managerIn(newOrg());

        String body = createCategory(manager.token(), "Programming Language")
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.name").value("Programming Language"))
            .andExpect(jsonPath("$.active").value(true))
            .andReturn().getResponse().getContentAsString();

        JsonNode node = objectMapper.readTree(body);
        assertThat(UUID.fromString(node.get("categoryId").asText())).isNotNull();
        assertThat(node.has("normalizedName")).isFalse();
    }

    @Test
    void caseInsensitiveSameOrgDuplicateRejectedButAnotherOrgAllowed() throws Exception {
        Manager managerA = managerIn(newOrg());
        createCategory(managerA.token(), "Database").andExpect(status().isCreated());
        createCategory(managerA.token(), "  database ").andExpect(status().isConflict());

        Manager managerB = managerIn(newOrg());
        createCategory(managerB.token(), "Database").andExpect(status().isCreated());
    }

    @Test
    void allOrganizationRolesCanReadCategories() throws Exception {
        Org org = newOrg();
        Manager manager = managerIn(org);
        createCategory(manager.token(), "Cloud").andExpect(status().isCreated());

        // ORGANIZATION_ADMIN (the org creator) can read.
        readCategories(org.adminToken()).andExpect(status().isOk())
            .andExpect(jsonPath("$[0].name").value("Cloud"));

        // EMPLOYEE can read.
        Employee employee = newEmployee(org, "emp");
        readCategories(tokenFor(employee.email())).andExpect(status().isOk());

        // PROJECT_MANAGER (without DEPARTMENT_MANAGER) can read.
        Employee pm = newEmployee(org, "pm");
        grantRoles(org.adminToken(), pm.userId(), List.of("EMPLOYEE", "PROJECT_MANAGER"));
        readCategories(tokenFor(pm.email())).andExpect(status().isOk());
    }

    @Test
    void listDefaultsToActiveOnlyAndIncludeInactiveReturnsAll() throws Exception {
        Manager manager = managerIn(newOrg());
        UUID activeId = createCategoryId(manager.token(), "Frameworks");
        UUID inactiveId = createCategoryId(manager.token(), "Legacy");
        deleteCategory(manager.token(), inactiveId).andExpect(status().isNoContent());

        assertThat(categoryIds(manager.token(), false))
            .contains(activeId.toString()).doesNotContain(inactiveId.toString());
        assertThat(categoryIds(manager.token(), true))
            .contains(activeId.toString(), inactiveId.toString());
    }

    @Test
    void patchRenamesAndTogglesActive() throws Exception {
        Manager manager = managerIn(newOrg());
        UUID id = createCategoryId(manager.token(), "Testing");

        patchCategory(manager.token(), id, Map.of("name", "QA & Testing"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("QA & Testing"));

        patchCategory(manager.token(), id, Map.of("active", false))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.active").value(false));
        patchCategory(manager.token(), id, Map.of("active", true))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.active").value(true));
    }

    @Test
    void deleteSoftDeactivatesIdempotentlyAndRowRemains() throws Exception {
        Manager manager = managerIn(newOrg());
        UUID id = createCategoryId(manager.token(), "Libraries");

        deleteCategory(manager.token(), id).andExpect(status().isNoContent());
        deleteCategory(manager.token(), id).andExpect(status().isNoContent());

        assertThat(skillCategoryRepository.findById(id))
            .isPresent().get().extracting(SkillCategory::isActive).isEqualTo(false);
        // Still resolvable within the same organization.
        mockMvc.perform(get("/skill-categories/" + id)
                .header(HttpHeaders.AUTHORIZATION, bearer(manager.token())))
            .andExpect(status().isOk());
    }

    @Test
    void crossOrganizationCategoryReturns404() throws Exception {
        Manager managerA = managerIn(newOrg());
        UUID id = createCategoryId(managerA.token(), "Cloud");

        Manager managerB = managerIn(newOrg());
        mockMvc.perform(get("/skill-categories/" + id)
                .header(HttpHeaders.AUTHORIZATION, bearer(managerB.token())))
            .andExpect(status().isNotFound());
    }

    @Test
    void employeeCannotWriteCategories() throws Exception {
        Org org = newOrg();
        Employee employee = newEmployee(org, "emp");
        createCategory(tokenFor(employee.email()), "Sneaky").andExpect(status().isForbidden());
    }

    @Test
    void platformSystemAdminWithoutOrganizationGetsControlledError() throws Exception {
        readCategories(systemAdminAccessToken()).andExpect(status().isBadRequest());
    }

    @Test
    void databaseUniqueOrganizationNormalizedNameIsEnforced() {
        Organization organization = organizationRepository.save(
            new Organization("Cat Constraint " + UUID.randomUUID(), "Addr"));
        skillCategoryRepository.saveAndFlush(
            new SkillCategory(organization, "Cloud", "cloud"));

        assertThatThrownBy(() -> skillCategoryRepository.saveAndFlush(
            new SkillCategory(organization, "CLOUD", "cloud")))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    // ---- helpers ----

    private Manager managerIn(Org org) throws Exception {
        return newDepartmentManager(org, "mgr");
    }

    private org.springframework.test.web.servlet.ResultActions readCategories(String token)
        throws Exception {
        return mockMvc.perform(get("/skill-categories")
            .header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }

    private org.springframework.test.web.servlet.ResultActions patchCategory(
        String token, UUID id, Map<String, Object> body) throws Exception {
        return mockMvc.perform(patch("/skill-categories/" + id)
            .header(HttpHeaders.AUTHORIZATION, bearer(token))
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(body)));
    }

    private org.springframework.test.web.servlet.ResultActions deleteCategory(String token, UUID id)
        throws Exception {
        return mockMvc.perform(delete("/skill-categories/" + id)
            .header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }

    private List<String> categoryIds(String token, boolean includeInactive) throws Exception {
        String body = mockMvc.perform(get("/skill-categories")
                .param("includeInactive", String.valueOf(includeInactive))
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        List<String> ids = new java.util.ArrayList<>();
        objectMapper.readTree(body).forEach(n -> ids.add(n.get("categoryId").asText()));
        return ids;
    }
}
