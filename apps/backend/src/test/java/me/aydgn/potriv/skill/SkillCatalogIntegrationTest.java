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

import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.organization.entity.Organization;
import me.aydgn.potriv.organization.repository.OrganizationRepository;
import me.aydgn.potriv.skill.entity.Skill;
import me.aydgn.potriv.skill.entity.SkillCategory;
import me.aydgn.potriv.skill.repository.SkillCategoryRepository;
import me.aydgn.potriv.skill.repository.SkillRepository;

class SkillCatalogIntegrationTest extends AbstractSkillIntegrationTest {

    @Autowired
    private SkillRepository skillRepository;

    @Autowired
    private SkillCategoryRepository skillCategoryRepository;

    @Autowired
    private OrganizationRepository organizationRepository;

    @Autowired
    private UserRepository userRepository;

    @Test
    void managerCreatesSkillWithUuidAuthorAndSafeAuthorProjection() throws Exception {
        Org org = newOrg();
        Manager manager = newDepartmentManager(org, "mgr");
        UUID categoryId = createCategoryId(manager.token(), "Programming Language");

        String body = createSkill(manager.token(), categoryId, "Java", "JVM language")
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.category.categoryId").value(categoryId.toString()))
            .andExpect(jsonPath("$.author.userId").value(manager.userId().toString()))
            .andExpect(jsonPath("$.author.email").value(manager.email()))
            .andExpect(jsonPath("$.departments").isArray())
            .andExpect(jsonPath("$.departments").isEmpty())
            .andReturn().getResponse().getContentAsString();

        JsonNode node = objectMapper.readTree(body);
        assertThat(UUID.fromString(node.get("skillId").asText())).isNotNull();
        assertThat(node.get("author").has("passwordHash")).isFalse();
        assertThat(node.get("author").has("status")).isFalse();
        assertThat(node.has("normalizedName")).isFalse();
    }

    @Test
    void categoryMustBeSameOrgAndActive() throws Exception {
        Org org = newOrg();
        Manager manager = newDepartmentManager(org, "mgr");

        // Cross-org category id is not usable.
        Manager foreignManager = newDepartmentManager(newOrg(), "fmgr");
        UUID foreignCategory = createCategoryId(foreignManager.token(), "Cloud");
        createSkill(manager.token(), foreignCategory, "Java", null)
            .andExpect(status().isBadRequest());

        // Inactive category is rejected.
        UUID categoryId = createCategoryId(manager.token(), "Programming Language");
        mockMvc.perform(delete("/skill-categories/" + categoryId)
                .header(HttpHeaders.AUTHORIZATION, bearer(manager.token())))
            .andExpect(status().isNoContent());
        createSkill(manager.token(), categoryId, "Java", null)
            .andExpect(status().isBadRequest());
    }

    @Test
    void sameOrgUsersCanReadSkillsIncludingOtherManagersAndCrossOrgIs404() throws Exception {
        Org org = newOrg();
        Manager managerA = newDepartmentManager(org, "a");
        UUID categoryId = createCategoryId(managerA.token(), "Programming Language");
        UUID skillId = createSkillId(managerA.token(), categoryId, "Java", null);

        // Same-org employee reads.
        Employee employee = newEmployee(org, "emp");
        mockMvc.perform(get("/skills/" + skillId)
                .header(HttpHeaders.AUTHORIZATION, bearer(tokenFor(employee.email()))))
            .andExpect(status().isOk());

        // Same-org other manager reads another manager's skill.
        Manager managerB = newDepartmentManager(org, "b");
        mockMvc.perform(get("/skills/" + skillId)
                .header(HttpHeaders.AUTHORIZATION, bearer(managerB.token())))
            .andExpect(status().isOk());

        // Cross-org is 404.
        Manager foreign = newDepartmentManager(newOrg(), "f");
        mockMvc.perform(get("/skills/" + skillId)
                .header(HttpHeaders.AUTHORIZATION, bearer(foreign.token())))
            .andExpect(status().isNotFound());
    }

    @Test
    void duplicateNormalizedNameInCategoryRejectedButAllowedElsewhere() throws Exception {
        Org org = newOrg();
        Manager manager = newDepartmentManager(org, "mgr");
        UUID cat1 = createCategoryId(manager.token(), "Programming Language");
        UUID cat2 = createCategoryId(manager.token(), "Frameworks");

        createSkill(manager.token(), cat1, "Java", null).andExpect(status().isCreated());
        // Same category, case-insensitive duplicate rejected.
        createSkill(manager.token(), cat1, "  java ", null).andExpect(status().isConflict());
        // Same display name in another category is allowed.
        createSkill(manager.token(), cat2, "Java", null).andExpect(status().isCreated());

        // Same category/name in another organization is allowed.
        Manager other = newDepartmentManager(newOrg(), "o");
        UUID otherCat = createCategoryId(other.token(), "Programming Language");
        createSkill(other.token(), otherCat, "Java", null).andExpect(status().isCreated());
    }

    @Test
    void listSupportsQueryCategoryFilterAndInactiveVisibility() throws Exception {
        Org org = newOrg();
        Manager manager = newDepartmentManager(org, "mgr");
        UUID cat1 = createCategoryId(manager.token(), "Programming Language");
        UUID cat2 = createCategoryId(manager.token(), "Database");
        createSkillId(manager.token(), cat1, "Java", null);
        createSkillId(manager.token(), cat1, "Python", null);
        UUID postgres = createSkillId(manager.token(), cat2, "PostgreSQL", null);

        assertThat(skillNames(manager.token(), "?q=jav")).containsExactly("Java");
        assertThat(skillNames(manager.token(), "?q=P")).contains("Python", "PostgreSQL");
        assertThat(skillNames(manager.token(), "?categoryId=" + cat2)).containsExactly("PostgreSQL");

        // Soft-delete one and check default vs includeInactive.
        mockMvc.perform(delete("/skills/" + postgres)
                .header(HttpHeaders.AUTHORIZATION, bearer(manager.token())))
            .andExpect(status().isNoContent());
        assertThat(skillNames(manager.token(), "")).doesNotContain("PostgreSQL");
        assertThat(skillNames(manager.token(), "?includeInactive=true")).contains("PostgreSQL");
    }

    @Test
    void onlyAuthorCanUpdateOrDeleteSkill() throws Exception {
        Org org = newOrg();
        Manager author = newDepartmentManager(org, "author");
        Manager other = newDepartmentManager(org, "other");
        UUID cat1 = createCategoryId(author.token(), "Programming Language");
        UUID cat2 = createCategoryId(author.token(), "Frameworks");
        UUID skillId = createSkillId(author.token(), cat1, "Java", "desc");

        // Non-author manager cannot modify or delete.
        patchSkill(other.token(), skillId, Map.of("name", "Hijack")).andExpect(status().isForbidden());
        mockMvc.perform(delete("/skills/" + skillId)
                .header(HttpHeaders.AUTHORIZATION, bearer(other.token())))
            .andExpect(status().isForbidden());

        // Author updates name, category, description and active.
        patchSkill(author.token(), skillId,
            Map.of("name", "Java SE", "categoryId", cat2.toString(),
                "description", "updated", "active", true))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("Java SE"))
            .andExpect(jsonPath("$.category.categoryId").value(cat2.toString()))
            .andExpect(jsonPath("$.description").value("updated"));

        // Author soft-deletes; idempotent; row remains.
        mockMvc.perform(delete("/skills/" + skillId)
                .header(HttpHeaders.AUTHORIZATION, bearer(author.token())))
            .andExpect(status().isNoContent());
        mockMvc.perform(delete("/skills/" + skillId)
                .header(HttpHeaders.AUTHORIZATION, bearer(author.token())))
            .andExpect(status().isNoContent());
        assertThat(skillRepository.findById(skillId))
            .isPresent().get().extracting(Skill::isActive).isEqualTo(false);
    }

    @Test
    void databaseUniqueOrganizationCategoryNormalizedNameIsEnforced() {
        Organization organization = organizationRepository.save(
            new Organization("Skill Constraint " + UUID.randomUUID(), "Addr"));
        SkillCategory category = skillCategoryRepository.saveAndFlush(
            new SkillCategory(organization, "Programming Language", "programming language"));
        User author = userRepository.findById(anyAdminId(organization)).orElseThrow();

        skillRepository.saveAndFlush(
            new Skill(organization, category, "Java", "java", null, author));

        assertThatThrownBy(() -> skillRepository.saveAndFlush(
            new Skill(organization, category, "JAVA", "java", null, author)))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void tenantIsolationHidesOtherOrganizationSkills() throws Exception {
        Org orgA = newOrg();
        Manager managerA = newDepartmentManager(orgA, "a");
        UUID catA = createCategoryId(managerA.token(), "Programming Language");
        createSkillId(managerA.token(), catA, "Java", null);

        Org orgB = newOrg();
        Manager managerB = newDepartmentManager(orgB, "b");
        UUID catB = createCategoryId(managerB.token(), "Programming Language");
        createSkillId(managerB.token(), catB, "Scala", null);

        // A never sees B's skill; category filter with B category yields nothing for A.
        assertThat(skillNames(managerA.token(), "")).containsExactly("Java");
        assertThat(skillNames(managerA.token(), "?categoryId=" + catB)).isEmpty();
    }

    // ---- helpers ----

    private org.springframework.test.web.servlet.ResultActions patchSkill(
        String token, UUID id, Map<String, Object> body) throws Exception {
        return mockMvc.perform(patch("/skills/" + id)
            .header(HttpHeaders.AUTHORIZATION, bearer(token))
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(body)));
    }

    private List<String> skillNames(String token, String query) throws Exception {
        String body = mockMvc.perform(get("/skills" + query)
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        List<String> names = new java.util.ArrayList<>();
        objectMapper.readTree(body).forEach(n -> names.add(n.get("name").asText()));
        return names;
    }

    private UUID anyAdminId(Organization organization) {
        // The DB-constraint test needs a persisted author; reuse the first user in
        // the organization, or create one when the org was built directly.
        User user = userRepository.save(new User(
            organization, "Author " + UUID.randomUUID(),
            uniqueEmail("author"), "$2a$10$abcdefghijklmnopqrstuv"));
        return user.getId();
    }
}
