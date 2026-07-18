package me.aydgn.potriv.project.regression;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.ResultActions;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.project.allocation.AbstractProjectAllocationIntegrationTest;

/**
 * Shared HTTP helpers for the Project-06..09 view regression tests.
 */
abstract class AbstractProjectDomainRegressionIntegrationTest
    extends AbstractProjectAllocationIntegrationTest {

    protected ResultActions getTeamView(String token, UUID projectId) throws Exception {
        return mockMvc.perform(get("/projects/" + projectId + "/team")
            .header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }

    protected JsonNode teamViewJson(String token, UUID projectId) throws Exception {
        return json(getTeamView(token, projectId));
    }

    protected ResultActions getMyProjects(String token) throws Exception {
        return mockMvc.perform(get("/me/projects")
            .header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }

    protected JsonNode myProjectsJson(String token) throws Exception {
        return json(getMyProjects(token));
    }

    protected ResultActions getDepartmentProjects(String token, String statusOrNull)
        throws Exception {
        var request = get("/department/projects")
            .header(HttpHeaders.AUTHORIZATION, bearer(token));
        if (statusOrNull != null) {
            request = request.param("status", statusOrNull);
        }
        return mockMvc.perform(request);
    }

    protected JsonNode departmentProjectsJson(String token, String statusOrNull)
        throws Exception {
        return json(getDepartmentProjects(token, statusOrNull));
    }

    protected ResultActions getProjectDetails(String token, UUID projectId) throws Exception {
        return mockMvc.perform(get("/projects/" + projectId + "/details")
            .header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }

    protected JsonNode projectDetailsJson(String token, UUID projectId) throws Exception {
        return json(getProjectDetails(token, projectId));
    }

    protected void removeMember(String managerToken, UUID departmentId, UUID userId)
        throws Exception {
        mockMvc.perform(delete("/departments/" + departmentId + "/members/" + userId)
                .header(HttpHeaders.AUTHORIZATION, bearer(managerToken)))
            .andExpect(status().isNoContent());
    }

    private JsonNode json(ResultActions actions) throws Exception {
        String body = actions.andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body);
    }

    /** The entry of the given array whose {@code employee.userId} matches, or null. */
    protected static JsonNode memberOf(JsonNode members, UUID userId) {
        for (JsonNode member : members) {
            if (member.get("employee").get("userId").asText().equals(userId.toString())) {
                return member;
            }
        }
        return null;
    }
}
