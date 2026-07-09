package me.aydgn.potriv.skill;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Tenant isolation across the whole skill domain: an organization never sees or
 * touches another organization's categories, skills, links, or assignments.
 */
class SkillOrganizationIsolationRegressionIntegrationTest extends AbstractSkillIntegrationTest {

    private record Fixture(
        Org org, Manager manager, UUID deptId, UUID categoryId, UUID skillId, String employeeToken) {
    }

    @Test
    void organizationsAreFullyIsolatedAcrossTheSkillDomain() throws Exception {
        Fixture a = fixture("A");
        Fixture b = fixture("B");

        String aManager = a.manager().token();
        String aEmployee = a.employeeToken();

        // A users never list B categories or skills.
        assertThat(ids(aManager, "/skill-categories", "categoryId")).doesNotContain(
            b.categoryId().toString());
        assertThat(ids(aEmployee, "/skills", "skillId")).doesNotContain(b.skillId().toString());

        // A category filter cannot resolve a B category.
        assertThat(ids(aManager, "/skills?categoryId=" + b.categoryId(), "skillId")).isEmpty();

        // A cannot fetch B category or skill by UUID.
        mockMvc.perform(get("/skill-categories/" + b.categoryId())
                .header(HttpHeaders.AUTHORIZATION, bearer(aManager)))
            .andExpect(status().isNotFound());
        String skill404 = mockMvc.perform(get("/skills/" + b.skillId())
                .header(HttpHeaders.AUTHORIZATION, bearer(aManager)))
            .andExpect(status().isNotFound())
            .andReturn().getResponse().getContentAsString();
        // The error payload does not leak B's skill name or B's admin email.
        assertThat(skill404).doesNotContain("Scala").doesNotContain("adminb");

        // A manager cannot link B's skill; A user cannot self-assign B's skill.
        mockMvc.perform(post("/skills/" + b.skillId() + "/departments/current")
                .header(HttpHeaders.AUTHORIZATION, bearer(aManager)))
            .andExpect(status().isNotFound());
        mockMvc.perform(post("/me/skills")
                .header(HttpHeaders.AUTHORIZATION, bearer(aEmployee))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(java.util.Map.of(
                    "skillId", b.skillId().toString(),
                    "level", "DOES", "experience", "ONE_TO_TWO_YEARS"))))
            .andExpect(status().isNotFound());

        // A's /me/skills never contains B assignments.
        String aList = mockMvc.perform(get("/me/skills")
                .header(HttpHeaders.AUTHORIZATION, bearer(aEmployee)))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(aList).doesNotContain(b.skillId().toString());
    }

    private Fixture fixture(String suffix) throws Exception {
        Org org = newOrg("Org" + suffix);
        Manager manager = newDepartmentManager(org, "mgr" + suffix.toLowerCase());
        UUID deptId = createDepartment(org.adminToken(), "Dept" + suffix);
        assignManager(org.adminToken(), deptId, manager.userId());
        UUID categoryId = createCategoryId(manager.token(), "Programming Language");
        String skillName = suffix.equals("B") ? "Scala" : "Java";
        UUID skillId = createSkillId(manager.token(), categoryId, skillName, null);

        Employee employee = newEmployee(org, "emp" + suffix.toLowerCase());
        String employeeToken = tokenFor(employee.email());
        // Give the employee an own assignment so the /me/skills isolation is meaningful.
        mockMvc.perform(post("/me/skills")
                .header(HttpHeaders.AUTHORIZATION, bearer(employeeToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(java.util.Map.of(
                    "skillId", skillId.toString(), "level", "DOES", "experience", "ONE_TO_TWO_YEARS"))))
            .andExpect(status().isCreated());

        return new Fixture(org, manager, deptId, categoryId, skillId, employeeToken);
    }

    private List<String> ids(String token, String path, String idField) throws Exception {
        String body = mockMvc.perform(get(path)
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        List<String> ids = new java.util.ArrayList<>();
        JsonNode array = objectMapper.readTree(body);
        array.forEach(n -> ids.add(n.get(idField).asText()));
        return ids;
    }
}
