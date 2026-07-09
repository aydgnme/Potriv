package me.aydgn.potriv.skill;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;

/**
 * Shared HTTP helpers for skill-domain integration tests.
 */
abstract class AbstractSkillIntegrationTest extends AbstractMockMvcIntegrationTest {

    protected record Org(UUID orgId, UUID adminId, String adminToken, String inviteToken) {
    }

    protected record Employee(UUID userId, String email) {
    }

    protected record Manager(UUID userId, String email, String token) {
    }

    protected Org newOrg() throws Exception {
        return newOrg("Org");
    }

    protected Org newOrg(String prefix) throws Exception {
        String email = uniqueEmail("admin");
        JsonNode admin = registerAdmin(uniqueName(prefix), email, "Password123!");
        return new Org(
            UUID.fromString(admin.get("organizationId").asText()),
            UUID.fromString(admin.get("userId").asText()),
            loginForAccessToken(email, "Password123!"),
            extractInviteToken(admin.get("employeeInviteUrl").asText()));
    }

    protected Employee newEmployee(Org org, String prefix) throws Exception {
        String email = uniqueEmail(prefix);
        JsonNode employee = registerEmployee(org.inviteToken(), email, "Password123!");
        return new Employee(UUID.fromString(employee.get("userId").asText()), email);
    }

    protected Manager newDepartmentManager(Org org, String prefix) throws Exception {
        Employee employee = newEmployee(org, prefix);
        grantRoles(org.adminToken(), employee.userId(), List.of("EMPLOYEE", "DEPARTMENT_MANAGER"));
        return new Manager(employee.userId(), employee.email(),
            loginForAccessToken(employee.email(), "Password123!"));
    }

    protected void grantRoles(String adminToken, UUID userId, List<String> roles) throws Exception {
        mockMvc.perform(patch("/users/" + userId + "/roles")
                .header(HttpHeaders.AUTHORIZATION, bearer(adminToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("roles", roles))))
            .andExpect(status().isOk());
    }

    protected String tokenFor(String email) throws Exception {
        return loginForAccessToken(email, "Password123!");
    }

    protected UUID createDepartment(String adminToken, String name) throws Exception {
        String body = mockMvc.perform(post("/departments")
                .header(HttpHeaders.AUTHORIZATION, bearer(adminToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("name", name))))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        return UUID.fromString(objectMapper.readTree(body).get("departmentId").asText());
    }

    protected void assignManager(String adminToken, UUID deptId, UUID userId) throws Exception {
        mockMvc.perform(put("/departments/" + deptId + "/manager")
                .header(HttpHeaders.AUTHORIZATION, bearer(adminToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("userId", userId.toString()))))
            .andExpect(status().isOk());
    }

    protected ResultActions createCategory(String token, String name) throws Exception {
        return mockMvc.perform(post("/skill-categories")
            .header(HttpHeaders.AUTHORIZATION, bearer(token))
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(Map.of("name", name))));
    }

    protected UUID createCategoryId(String token, String name) throws Exception {
        String body = createCategory(token, name)
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        return UUID.fromString(objectMapper.readTree(body).get("categoryId").asText());
    }

    protected ResultActions createSkill(
        String token, UUID categoryId, String name, String description) throws Exception {
        Map<String, Object> payload = new HashMap<>();
        payload.put("categoryId", categoryId.toString());
        payload.put("name", name);
        if (description != null) {
            payload.put("description", description);
        }
        return mockMvc.perform(post("/skills")
            .header(HttpHeaders.AUTHORIZATION, bearer(token))
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(payload)));
    }

    protected UUID createSkillId(
        String token, UUID categoryId, String name, String description) throws Exception {
        String body = createSkill(token, categoryId, name, description)
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        return UUID.fromString(objectMapper.readTree(body).get("skillId").asText());
    }
}
