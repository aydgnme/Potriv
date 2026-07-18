package me.aydgn.potriv.project;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
 * Shared HTTP helpers for project-lifecycle integration tests.
 */
abstract class AbstractProjectLifecycleIntegrationTest extends AbstractMockMvcIntegrationTest {

    protected record Org(UUID orgId, UUID adminId, String adminToken, String inviteToken) {
    }

    protected record Member(UUID userId, String email, String token) {
    }

    protected Org newOrg() throws Exception {
        String email = uniqueEmail("admin");
        JsonNode admin = registerAdmin(uniqueName("Org"), email, "Password123!");
        return new Org(
            UUID.fromString(admin.get("organizationId").asText()),
            UUID.fromString(admin.get("userId").asText()),
            loginForAccessToken(email, "Password123!"),
            extractInviteToken(admin.get("employeeInviteUrl").asText()));
    }

    protected Member newEmployee(Org org, String prefix) throws Exception {
        String email = uniqueEmail(prefix);
        JsonNode employee = registerEmployee(org.inviteToken(), email, "Password123!");
        return new Member(UUID.fromString(employee.get("userId").asText()), email,
            loginForAccessToken(email, "Password123!"));
    }

    protected Member newProjectManager(Org org, String prefix) throws Exception {
        return newMemberWithRoles(org, prefix, List.of("EMPLOYEE", "PROJECT_MANAGER"));
    }

    protected Member newDepartmentManager(Org org, String prefix) throws Exception {
        return newMemberWithRoles(org, prefix, List.of("EMPLOYEE", "DEPARTMENT_MANAGER"));
    }

    private Member newMemberWithRoles(Org org, String prefix, List<String> roles)
        throws Exception {
        Member member = newEmployee(org, prefix);
        grantRoles(org.adminToken(), member.userId(), roles);
        // Fresh token so the granted roles are effective.
        return new Member(member.userId(), member.email(),
            loginForAccessToken(member.email(), "Password123!"));
    }

    protected void grantRoles(String adminToken, UUID userId, List<String> roles)
        throws Exception {
        mockMvc.perform(patch("/users/" + userId + "/roles")
                .header(HttpHeaders.AUTHORIZATION, bearer(adminToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("roles", roles))))
            .andExpect(status().isOk());
    }

    protected UUID createTeamRoleId(String adminToken, String name) throws Exception {
        String body = mockMvc.perform(post("/team-roles")
                .header(HttpHeaders.AUTHORIZATION, bearer(adminToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("name", name))))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        return UUID.fromString(objectMapper.readTree(body).get("teamRoleId").asText());
    }

    protected void deactivateTeamRole(String adminToken, UUID teamRoleId) throws Exception {
        mockMvc.perform(patch("/team-roles/" + teamRoleId)
                .header(HttpHeaders.AUTHORIZATION, bearer(adminToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("active", false))))
            .andExpect(status().isOk());
    }

    /** A valid FIXED / NOT_STARTED project payload; override entries as needed. */
    protected Map<String, Object> projectPayload(String name) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("name", name);
        payload.put("period", "FIXED");
        payload.put("startDate", "2026-08-01");
        payload.put("deadlineDate", "2026-12-31");
        payload.put("status", "NOT_STARTED");
        payload.put("generalDescription", "Test project description");
        return payload;
    }

    protected ResultActions createProject(String token, Map<String, Object> payload)
        throws Exception {
        return mockMvc.perform(post("/projects")
            .header(HttpHeaders.AUTHORIZATION, bearer(token))
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(payload)));
    }

    protected JsonNode createProjectExpectCreated(String token, Map<String, Object> payload)
        throws Exception {
        String body = createProject(token, payload)
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body);
    }

    protected UUID createProjectId(String token, Map<String, Object> payload) throws Exception {
        return UUID.fromString(createProjectExpectCreated(token, payload)
            .get("projectId").asText());
    }

    protected ResultActions getProject(String token, UUID projectId) throws Exception {
        return mockMvc.perform(get("/projects/" + projectId)
            .header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }

    protected ResultActions patchProject(String token, UUID projectId, Map<String, Object> payload)
        throws Exception {
        return mockMvc.perform(patch("/projects/" + projectId)
            .header(HttpHeaders.AUTHORIZATION, bearer(token))
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(payload)));
    }

    protected JsonNode patchProjectExpectOk(String token, UUID projectId,
        Map<String, Object> payload) throws Exception {
        String body = patchProject(token, projectId, payload)
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body);
    }

    protected ResultActions deleteProject(String token, UUID projectId, String query)
        throws Exception {
        return mockMvc.perform(delete("/projects/" + projectId + query)
            .header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }
}
