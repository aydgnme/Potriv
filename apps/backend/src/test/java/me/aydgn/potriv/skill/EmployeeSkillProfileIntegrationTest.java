package me.aydgn.potriv.skill;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.skill.entity.EmployeeSkill;
import me.aydgn.potriv.skill.entity.Skill;
import me.aydgn.potriv.skill.entity.SkillExperience;
import me.aydgn.potriv.skill.entity.SkillLevel;
import me.aydgn.potriv.skill.repository.EmployeeSkillRepository;
import me.aydgn.potriv.skill.repository.SkillRepository;

class EmployeeSkillProfileIntegrationTest extends AbstractSkillIntegrationTest {

    @Autowired
    private EmployeeSkillRepository employeeSkillRepository;

    @Autowired
    private SkillRepository skillRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void anyRoleSelfAssignsWithUuidOwnedByPrincipal() throws Exception {
        Org org = newOrg();
        UUID skillId = activeSkill(org);

        // ORGANIZATION_ADMIN (org creator), EMPLOYEE, DEPARTMENT_MANAGER, PROJECT_MANAGER.
        String adminEmployeeSkill = assign(org.adminToken(), skillId, "DOES", "TWO_TO_FOUR_YEARS")
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        assertThat(UUID.fromString(
            objectMapper.readTree(adminEmployeeSkill).get("employeeSkillId").asText())).isNotNull();

        Employee employee = newEmployee(org, "emp");
        assign(tokenFor(employee.email()), skillId, "LEARNS", "ZERO_TO_SIX_MONTHS")
            .andExpect(status().isCreated());

        Manager manager = newDepartmentManager(org, "mgr");
        assign(manager.token(), skillId, "TEACHES", "MORE_THAN_SEVEN_YEARS")
            .andExpect(status().isCreated());

        Employee pm = newEmployee(org, "pm");
        grantRoles(org.adminToken(), pm.userId(), List.of("EMPLOYEE", "PROJECT_MANAGER"));
        String pmBody = assign(tokenFor(pm.email()), skillId, "KNOWS", "ONE_TO_TWO_YEARS")
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();

        // The owner is the authenticated principal (no userId is accepted).
        EmployeeSkill pmAssignment = employeeSkillRepository.findById(UUID.fromString(
            objectMapper.readTree(pmBody).get("employeeSkillId").asText())).orElseThrow();
        assertThat(pmAssignment.getUser().getId()).isEqualTo(pm.userId());
    }

    @Test
    void crossOrgSkillIs404AndInactiveSkillCannotBeAssigned() throws Exception {
        Org orgA = newOrg();
        Employee employeeA = newEmployee(orgA, "emp");

        Org orgB = newOrg();
        UUID foreignSkill = activeSkill(orgB);
        assign(tokenFor(employeeA.email()), foreignSkill, "DOES", "ONE_TO_TWO_YEARS")
            .andExpect(status().isNotFound());

        // Inactive skill in own org cannot be newly assigned.
        InactiveSkill inactive = inactiveSkill(orgA);
        assign(tokenFor(employeeA.email()), inactive.skillId(), "DOES", "ONE_TO_TWO_YEARS")
            .andExpect(status().isBadRequest());
    }

    @Test
    void assignableWithoutDepartmentLinkAndDuplicateRejected() throws Exception {
        Org org = newOrg();
        UUID skillId = activeSkill(org);
        Employee employee = newEmployee(org, "emp");
        String token = tokenFor(employee.email());

        // No department link and no membership required.
        assign(token, skillId, "DOES", "ONE_TO_TWO_YEARS").andExpect(status().isCreated());
        // Duplicate user + skill rejected.
        assign(token, skillId, "KNOWS", "TWO_TO_FOUR_YEARS").andExpect(status().isConflict());
    }

    @Test
    void databaseUniqueUserSkillIsEnforced() throws Exception {
        Org org = newOrg();
        UUID skillId = activeSkill(org);
        User user = userRepository.findById(org.adminId()).orElseThrow();
        Skill skill = skillRepository.findById(skillId).orElseThrow();

        employeeSkillRepository.saveAndFlush(
            new EmployeeSkill(user, skill, SkillLevel.DOES, SkillExperience.ONE_TO_TWO_YEARS));

        assertThatThrownBy(() -> employeeSkillRepository.saveAndFlush(
            new EmployeeSkill(user, skill, SkillLevel.KNOWS, SkillExperience.TWO_TO_FOUR_YEARS)))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void getListsOnlyOwnAssignmentsOrderedByCategoryThenSkill() throws Exception {
        Org org = newOrg();
        Manager manager = newDepartmentManager(org, "mgr");
        UUID catB = createCategoryId(manager.token(), "Zeta Category");
        UUID catA = createCategoryId(manager.token(), "Alpha Category");
        UUID skillZeta = createSkillId(manager.token(), catB, "AAA", null);
        UUID skillAlpha = createSkillId(manager.token(), catA, "ZZZ", null);

        Employee owner = newEmployee(org, "owner");
        String ownerToken = tokenFor(owner.email());
        assign(ownerToken, skillZeta, "DOES", "ONE_TO_TWO_YEARS").andExpect(status().isCreated());
        assign(ownerToken, skillAlpha, "DOES", "ONE_TO_TWO_YEARS").andExpect(status().isCreated());

        // Another user's assignment must not appear.
        Employee other = newEmployee(org, "other");
        assign(tokenFor(other.email()), skillZeta, "DOES", "ONE_TO_TWO_YEARS")
            .andExpect(status().isCreated());

        JsonNode list = objectMapper.readTree(listOwn(ownerToken)
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(list).hasSize(2);
        // Ordered by category name (Alpha before Zeta).
        assertThat(list.get(0).get("skill").get("category").get("name").asText())
            .isEqualTo("Alpha Category");
        assertThat(list.get(1).get("skill").get("category").get("name").asText())
            .isEqualTo("Zeta Category");
    }

    @Test
    void levelMappingIsExactAndStoredAsStringNotOrdinal() throws Exception {
        Org org = newOrg();
        UUID skillId = activeSkill(org);
        Employee employee = newEmployee(org, "emp");
        String token = tokenFor(employee.email());

        String body = assign(token, skillId, "LEARNS", "ZERO_TO_SIX_MONTHS")
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID id = UUID.fromString(objectMapper.readTree(body).get("employeeSkillId").asText());
        assertLevel(objectMapper.readTree(body), "LEARNS", 1, "Learns");

        // The column stores the enum name, never the ordinal.
        assertThat(jdbcTemplate.queryForObject(
            "select level from employee_skills where id = ?", String.class, id)).isEqualTo("LEARNS");

        assertLevel(patchBody(token, id, Map.of("level", "KNOWS")), "KNOWS", 2, "Knows");
        assertLevel(patchBody(token, id, Map.of("level", "DOES")), "DOES", 3, "Does");
        assertLevel(patchBody(token, id, Map.of("level", "HELPS")), "HELPS", 4, "Helps");
        assertLevel(patchBody(token, id, Map.of("level", "TEACHES")), "TEACHES", 5, "Teaches");
    }

    @Test
    void experienceMappingIsExact() throws Exception {
        Org org = newOrg();
        UUID skillId = activeSkill(org);
        Employee employee = newEmployee(org, "emp");
        String token = tokenFor(employee.email());
        UUID id = UUID.fromString(objectMapper.readTree(
            assign(token, skillId, "DOES", "ZERO_TO_SIX_MONTHS")
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString())
            .get("employeeSkillId").asText());

        assertExperience(getFirst(token), "ZERO_TO_SIX_MONTHS", "0-6 months");
        assertExperience(patchBody(token, id, Map.of("experience", "SIX_TO_TWELVE_MONTHS")),
            "SIX_TO_TWELVE_MONTHS", "6-12 months");
        assertExperience(patchBody(token, id, Map.of("experience", "ONE_TO_TWO_YEARS")),
            "ONE_TO_TWO_YEARS", "1-2 years");
        assertExperience(patchBody(token, id, Map.of("experience", "TWO_TO_FOUR_YEARS")),
            "TWO_TO_FOUR_YEARS", "2-4 years");
        assertExperience(patchBody(token, id, Map.of("experience", "FOUR_TO_SEVEN_YEARS")),
            "FOUR_TO_SEVEN_YEARS", "4-7 years");
        assertExperience(patchBody(token, id, Map.of("experience", "MORE_THAN_SEVEN_YEARS")),
            "MORE_THAN_SEVEN_YEARS", ">7 years");
    }

    @Test
    void patchIsPartialSkillUnchangedForeignForbiddenAndInvalidEnumIs400() throws Exception {
        Org org = newOrg();
        UUID skillId = activeSkill(org);
        Employee employee = newEmployee(org, "emp");
        String token = tokenFor(employee.email());
        UUID id = UUID.fromString(objectMapper.readTree(
            assign(token, skillId, "DOES", "ONE_TO_TWO_YEARS")
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString())
            .get("employeeSkillId").asText());

        // Update only level; experience and skill unchanged.
        JsonNode afterLevel = patchBody(token, id, Map.of("level", "HELPS"));
        assertThat(afterLevel.get("experience").get("code").asText()).isEqualTo("ONE_TO_TWO_YEARS");
        assertThat(afterLevel.get("skill").get("skillId").asText()).isEqualTo(skillId.toString());

        // Another user cannot patch it.
        Employee other = newEmployee(org, "other");
        patchAssignment(token(other), id, Map.of("level", "LEARNS")).andExpect(status().isNotFound());

        // Invalid enum is a 400, never a 500.
        patchAssignment(token, id, Map.of("level", "WIZARD")).andExpect(status().isBadRequest());
    }

    @Test
    void deleteRemovesAssignmentOnlyAndForeignIsNotFound() throws Exception {
        Org org = newOrg();
        UUID skillId = activeSkill(org);
        Employee employee = newEmployee(org, "emp");
        String token = tokenFor(employee.email());
        UUID id = UUID.fromString(objectMapper.readTree(
            assign(token, skillId, "DOES", "ONE_TO_TWO_YEARS")
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString())
            .get("employeeSkillId").asText());

        // Another user's delete is 404.
        Employee other = newEmployee(org, "other");
        mockMvc.perform(delete("/me/skills/" + id)
                .header(HttpHeaders.AUTHORIZATION, bearer(token(other))))
            .andExpect(status().isNotFound());

        // Owner deletes; the User and Skill remain.
        mockMvc.perform(delete("/me/skills/" + id)
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isNoContent());
        assertThat(employeeSkillRepository.findById(id)).isEmpty();
        assertThat(userRepository.findById(employee.userId())).isPresent();
        assertThat(skillRepository.findById(skillId)).isPresent();
    }

    @Test
    void existingAssignmentSurvivesSkillDeactivationAndRemainsManageable() throws Exception {
        Org org = newOrg();
        Manager manager = newDepartmentManager(org, "mgr");
        UUID skillId = createSkillId(
            manager.token(), createCategoryId(manager.token(), "Programming Language"),
            "Java", null);
        Employee employee = newEmployee(org, "emp");
        String token = tokenFor(employee.email());
        UUID id = UUID.fromString(objectMapper.readTree(
            assign(token, skillId, "DOES", "ONE_TO_TWO_YEARS")
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString())
            .get("employeeSkillId").asText());

        // The author deactivates the skill.
        mockMvc.perform(delete("/skills/" + skillId)
                .header(HttpHeaders.AUTHORIZATION, bearer(manager.token())))
            .andExpect(status().isNoContent());

        // The assignment remains and is shown with skill.active=false.
        JsonNode first = getFirst(token);
        assertThat(first.get("skill").get("active").asBoolean()).isFalse();

        // PATCH and DELETE remain allowed.
        patchAssignment(token, id, Map.of("level", "TEACHES")).andExpect(status().isOk());
        mockMvc.perform(delete("/me/skills/" + id)
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isNoContent());
    }

    @Test
    void platformSystemAdminWithoutOrganizationGetsControlledError() throws Exception {
        listOwn(systemAdminAccessToken()).andExpect(status().isBadRequest());
    }

    // ---- helpers ----

    private record InactiveSkill(UUID skillId) {
    }

    private UUID activeSkill(Org org) throws Exception {
        Manager manager = newDepartmentManager(org, "skmgr");
        return createSkillId(
            manager.token(), createCategoryId(manager.token(), "Programming Language"),
            "Java " + UUID.randomUUID(), null);
    }

    private InactiveSkill inactiveSkill(Org org) throws Exception {
        Manager manager = newDepartmentManager(org, "skmgr");
        UUID skillId = createSkillId(
            manager.token(), createCategoryId(manager.token(), "Programming Language"),
            "Legacy " + UUID.randomUUID(), null);
        mockMvc.perform(delete("/skills/" + skillId)
                .header(HttpHeaders.AUTHORIZATION, bearer(manager.token())))
            .andExpect(status().isNoContent());
        return new InactiveSkill(skillId);
    }

    private String token(Employee employee) throws Exception {
        return tokenFor(employee.email());
    }

    private ResultActions assign(String token, UUID skillId, String level, String experience)
        throws Exception {
        return mockMvc.perform(post("/me/skills")
            .header(HttpHeaders.AUTHORIZATION, bearer(token))
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(Map.of(
                "skillId", skillId.toString(), "level", level, "experience", experience))));
    }

    private ResultActions patchAssignment(String token, UUID id, Map<String, Object> body) throws Exception {
        return mockMvc.perform(patch("/me/skills/" + id)
            .header(HttpHeaders.AUTHORIZATION, bearer(token))
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(body)));
    }

    private JsonNode patchBody(String token, UUID id, Map<String, Object> body) throws Exception {
        return objectMapper.readTree(patchAssignment(token, id, body)
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private ResultActions listOwn(String token) throws Exception {
        return mockMvc.perform(get("/me/skills")
            .header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }

    private JsonNode getFirst(String token) throws Exception {
        return objectMapper.readTree(listOwn(token)
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get(0);
    }

    private void assertLevel(JsonNode response, String code, int value, String label) {
        JsonNode level = response.get("level");
        assertThat(level.get("code").asText()).isEqualTo(code);
        assertThat(level.get("value").asInt()).isEqualTo(value);
        assertThat(level.get("label").asText()).isEqualTo(label);
    }

    private void assertExperience(JsonNode response, String code, String label) {
        JsonNode experience = response.get("experience");
        assertThat(experience.get("code").asText()).isEqualTo(code);
        assertThat(experience.get("label").asText()).isEqualTo(label);
    }
}
