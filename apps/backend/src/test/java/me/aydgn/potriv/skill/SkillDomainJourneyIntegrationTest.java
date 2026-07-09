package me.aydgn.potriv.skill;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
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

/**
 * End-to-end skill-domain journey exercising the full surface in one ordered
 * sequence.
 */
class SkillDomainJourneyIntegrationTest extends AbstractSkillIntegrationTest {

    @Test
    void fullSkillDomainJourney() throws Exception {
        // 1-3. register org admin, register manager, grant DEPARTMENT_MANAGER
        Org org = newOrg("JourneyOrg");
        Manager manager = newDepartmentManager(org, "mgr");

        // 4-5. create department, assign manager
        UUID deptId = createDepartment(org.adminToken(), "Engineering");
        assignManager(org.adminToken(), deptId, manager.userId());

        // 6-8. (manager already logged in) create category and skill
        UUID categoryId = createCategoryId(manager.token(), "Programming Language");
        UUID skillId = createSkillId(manager.token(), categoryId, "Java", "JVM language");

        // 9. departments empty
        assertThat(departments(manager.token(), skillId)).isEmpty();

        // 10-11. link Java to the managed department; it appears
        mockMvc.perform(post("/skills/" + skillId + "/departments/current")
                .header(HttpHeaders.AUTHORIZATION, bearer(manager.token())))
            .andExpect(status().isOk());
        assertThat(departments(manager.token(), skillId)).containsExactly(deptId.toString());

        // 12-14. register + login employee, find Java in the catalog
        Employee employee = newEmployee(org, "emp");
        String employeeToken = tokenFor(employee.email());
        assertThat(skillNames(employeeToken)).contains("Java");

        // 15-18. self-assign Java as DOES / TWO_TO_FOUR_YEARS and verify mappings
        UUID employeeSkillId = UUID.fromString(objectMapper.readTree(
            mockMvc.perform(post("/me/skills")
                    .header(HttpHeaders.AUTHORIZATION, bearer(employeeToken))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsString(Map.of(
                        "skillId", skillId.toString(), "level", "DOES",
                        "experience", "TWO_TO_FOUR_YEARS"))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString()).get("employeeSkillId").asText());

        JsonNode assignment = ownSkills(employeeToken).get(0);
        assertThat(assignment.get("level").get("value").asInt()).isEqualTo(3);
        assertThat(assignment.get("level").get("label").asText()).isEqualTo("Does");
        assertThat(assignment.get("experience").get("label").asText()).isEqualTo("2-4 years");

        // 19-20. patch to HELPS / FOUR_TO_SEVEN_YEARS
        JsonNode patched = objectMapper.readTree(
            mockMvc.perform(patch("/me/skills/" + employeeSkillId)
                    .header(HttpHeaders.AUTHORIZATION, bearer(employeeToken))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsString(Map.of(
                        "level", "HELPS", "experience", "FOUR_TO_SEVEN_YEARS"))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertThat(patched.get("level").get("value").asInt()).isEqualTo(4);
        assertThat(patched.get("level").get("label").asText()).isEqualTo("Helps");

        // 21-22. delete assignment; profile empty
        mockMvc.perform(delete("/me/skills/" + employeeSkillId)
                .header(HttpHeaders.AUTHORIZATION, bearer(employeeToken)))
            .andExpect(status().isNoContent());
        assertThat(ownSkills(employeeToken)).isEmpty();

        // 23-25. (manager already logged in) unlink Java, soft-delete Java
        mockMvc.perform(delete("/skills/" + skillId + "/departments/current")
                .header(HttpHeaders.AUTHORIZATION, bearer(manager.token())))
            .andExpect(status().isNoContent());
        mockMvc.perform(delete("/skills/" + skillId)
                .header(HttpHeaders.AUTHORIZATION, bearer(manager.token())))
            .andExpect(status().isNoContent());

        // 26-27. default list excludes Java; includeInactive contains it
        assertThat(skillNames(manager.token())).doesNotContain("Java");
        assertThat(skillNamesWithQuery(manager.token(), "?includeInactive=true")).contains("Java");
    }

    private List<String> departments(String token, UUID skillId) throws Exception {
        String body = mockMvc.perform(get("/skills/" + skillId + "/departments")
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        List<String> ids = new java.util.ArrayList<>();
        objectMapper.readTree(body).forEach(n -> ids.add(n.get("departmentId").asText()));
        return ids;
    }

    private List<String> skillNames(String token) throws Exception {
        return skillNamesWithQuery(token, "");
    }

    private List<String> skillNamesWithQuery(String token, String query) throws Exception {
        String body = mockMvc.perform(get("/skills" + query)
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        List<String> names = new java.util.ArrayList<>();
        objectMapper.readTree(body).forEach(n -> names.add(n.get("name").asText()));
        return names;
    }

    private JsonNode ownSkills(String token) throws Exception {
        return objectMapper.readTree(mockMvc.perform(get("/me/skills")
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }
}
