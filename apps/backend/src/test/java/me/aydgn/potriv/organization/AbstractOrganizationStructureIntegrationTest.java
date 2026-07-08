package me.aydgn.potriv.organization;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;

/**
 * Shared HTTP helpers for organization-structure regression tests.
 */
abstract class AbstractOrganizationStructureIntegrationTest extends AbstractMockMvcIntegrationTest {

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
        return new Manager(employee.userId(), employee.email(), tokenFor(employee.email()));
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

    protected UUID createDepartment(String token, String name) throws Exception {
        String body = mockMvc.perform(post("/departments")
                .header(HttpHeaders.AUTHORIZATION, bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("name", name))))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        return UUID.fromString(objectMapper.readTree(body).get("departmentId").asText());
    }

    protected ResultActions createTeamRole(String token, String name) throws Exception {
        return mockMvc.perform(post("/team-roles")
            .header(HttpHeaders.AUTHORIZATION, bearer(token))
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(Map.of("name", name))));
    }

    protected ResultActions assignManager(String token, UUID deptId, UUID userId) throws Exception {
        return mockMvc.perform(put("/departments/" + deptId + "/manager")
            .header(HttpHeaders.AUTHORIZATION, bearer(token))
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(Map.of("userId", userId.toString()))));
    }

    protected ResultActions unassignManager(String token, UUID deptId) throws Exception {
        return mockMvc.perform(delete("/departments/" + deptId + "/manager")
            .header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }

    protected ResultActions listUnassigned(String token) throws Exception {
        return mockMvc.perform(get("/departments/unassigned-employees")
            .header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }

    protected ResultActions listMembers(String token, UUID deptId) throws Exception {
        return mockMvc.perform(get("/departments/" + deptId + "/members")
            .header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }

    protected ResultActions addMember(String token, UUID deptId, UUID userId) throws Exception {
        return mockMvc.perform(post("/departments/" + deptId + "/members/" + userId)
            .header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }

    protected ResultActions removeMember(String token, UUID deptId, UUID userId) throws Exception {
        return mockMvc.perform(delete("/departments/" + deptId + "/members/" + userId)
            .header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }

    protected JsonNode getDepartment(String token, UUID deptId) throws Exception {
        String body = mockMvc.perform(get("/departments/" + deptId)
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body);
    }

    protected List<String> emailsOf(ResultActions listAction) throws Exception {
        String body = listAction.andReturn().getResponse().getContentAsString();
        JsonNode array = objectMapper.readTree(body);
        List<String> emails = new java.util.ArrayList<>();
        array.forEach(node -> emails.add(node.get("email").asText()));
        return emails;
    }
}
