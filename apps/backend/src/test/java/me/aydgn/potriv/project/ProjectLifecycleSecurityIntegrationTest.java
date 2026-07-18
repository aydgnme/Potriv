package me.aydgn.potriv.project;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

/**
 * Project-01 RBAC, tenant isolation, and safe response shape.
 */
class ProjectLifecycleSecurityIntegrationTest extends AbstractProjectLifecycleIntegrationTest {

    @Test
    void projectEndpointsRequireAuthentication() throws Exception {
        mockMvc.perform(post("/projects")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(projectPayload(uniqueName("Anon")))))
            .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/projects/managed")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/projects/" + UUID.randomUUID()))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void nonProjectManagerRolesCannotManageProjects() throws Exception {
        Org org = newOrg();
        Member owner = newProjectManager(org, "owner");
        UUID projectId = createProjectId(owner.token(), projectPayload(uniqueName("Own")));

        Member employee = newEmployee(org, "emp");
        Member departmentManager = newDepartmentManager(org, "dm");

        for (String token : new String[] {
            employee.token(), departmentManager.token(), org.adminToken()}) {
            createProject(token, projectPayload(uniqueName("Denied")))
                .andExpect(status().isForbidden());
            getProject(token, projectId).andExpect(status().isForbidden());
            mockMvc.perform(get("/projects/managed")
                    .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isForbidden());
        }
    }

    @Test
    void nonOwnerAndCrossOrgAccessResolveToNotFound() throws Exception {
        Org orgA = newOrg();
        Org orgB = newOrg();
        Member owner = newProjectManager(orgA, "owner");
        Member sameOrgPm = newProjectManager(orgA, "rival");
        Member crossOrgPm = newProjectManager(orgB, "foreign");
        UUID projectId = createProjectId(owner.token(), projectPayload(uniqueName("Own")));

        for (Member intruder : new Member[] {sameOrgPm, crossOrgPm}) {
            getProject(intruder.token(), projectId).andExpect(status().isNotFound());
            patchProject(intruder.token(), projectId, Map.of("name", uniqueName("Hijack")))
                .andExpect(status().isNotFound());
            deleteProject(intruder.token(), projectId, "?confirmed=true")
                .andExpect(status().isNotFound());
        }

        // The project is untouched after all attempts.
        getProject(owner.token(), projectId).andExpect(status().isOk());
    }

    @Test
    void platformSystemAdminWithoutOrganizationGetsControlledError() throws Exception {
        String systemAdminToken = systemAdminAccessToken();

        // The platform admin passes role checks but has no organization context;
        // the resolver answers with a controlled 400 instead of leaking data.
        mockMvc.perform(get("/projects/managed")
                .header(HttpHeaders.AUTHORIZATION, bearer(systemAdminToken)))
            .andExpect(status().isBadRequest());
    }

    @Test
    void projectResponsesExposeOnlySafeFields() throws Exception {
        Org org = newOrg();
        Member pm = newProjectManager(org, "pm");
        UUID roleId = createTeamRoleId(org.adminToken(), uniqueName("Backend"));
        Map<String, Object> payload = projectPayload(uniqueName("Safe"));
        payload.put("technologyStack", java.util.List.of("Java"));
        payload.put("teamRoles", java.util.List.of(
            Map.of("teamRoleId", roleId.toString(), "requiredMembers", 1)));
        UUID projectId = createProjectId(pm.token(), payload);

        String body = getProject(pm.token(), projectId)
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.projectManager.passwordHash").doesNotExist())
            .andExpect(jsonPath("$.projectManager.password").doesNotExist())
            .andExpect(jsonPath("$.projectManager.failedLoginAttempts").doesNotExist())
            .andExpect(jsonPath("$.projectManager.lockedUntil").doesNotExist())
            .andReturn().getResponse().getContentAsString();

        // No security internals or normalized names anywhere in the payload.
        assertThat(body).doesNotContain(
            "passwordHash", "normalizedName", "refreshToken", "lockedUntil", "session");
    }
}
