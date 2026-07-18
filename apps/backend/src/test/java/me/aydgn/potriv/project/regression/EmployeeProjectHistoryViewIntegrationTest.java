package me.aydgn.potriv.project.regression;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Project-07 employee project history: self-scoped current/past allocation
 * episodes with snapshot roles and the project technology stack.
 */
class EmployeeProjectHistoryViewIntegrationTest
    extends AbstractProjectDomainRegressionIntegrationTest {

    @Test
    void employeeWithoutAllocationsGetsEmptyLists() throws Exception {
        Workspace workspace = newWorkspace();
        JsonNode response = myProjectsJson(workspace.employee().token());

        assertThat(response.get("userId").asText())
            .isEqualTo(workspace.employee().userId().toString());
        assertThat(response.get("currentProjects")).isEmpty();
        assertThat(response.get("pastProjects")).isEmpty();
        assertThat(response.get("generatedAt").isNull()).isFalse();
    }

    @Test
    void allocationEpisodeMovesFromCurrentToPast() throws Exception {
        Workspace workspace = newWorkspace();
        Map<String, Object> payload = projectPayload(uniqueName("Apollo"));
        payload.put("status", "STARTING");
        payload.put("technologyStack", List.of("Java", "angular"));
        UUID projectId = createProjectId(workspace.pm().token(), payload);
        UUID allocationId = allocate(workspace, projectId, workspace.employee().userId(), 5);

        JsonNode current = myProjectsJson(workspace.employee().token());
        assertThat(current.get("currentProjects")).hasSize(1);
        JsonNode item = current.get("currentProjects").get(0);
        assertThat(item.get("projectId").asText()).isEqualTo(projectId.toString());
        assertThat(item.get("allocationId").asText()).isEqualTo(allocationId.toString());
        assertThat(item.get("workHoursPerDay").asInt()).isEqualTo(5);
        assertThat(item.get("deallocatedAt").isNull()).isTrue();
        // Snapshot roles and the name-ordered technology stack.
        assertThat(item.get("roles").get(0).get("teamRoleId").asText())
            .isEqualTo(workspace.teamRoleId().toString());
        assertThat(item.get("technologyStack")).extracting(
                technology -> technology.get("name").asText())
            .containsExactly("angular", "Java");
        assertThat(current.get("pastProjects")).isEmpty();

        deallocate(workspace, projectId, allocationId);
        JsonNode past = myProjectsJson(workspace.employee().token());
        assertThat(past.get("currentProjects")).isEmpty();
        assertThat(past.get("pastProjects")).hasSize(1);
        assertThat(past.get("pastProjects").get(0).get("allocationId").asText())
            .isEqualTo(allocationId.toString());
        assertThat(past.get("pastProjects").get(0).get("deallocatedAt").isNull()).isFalse();
    }

    @Test
    void closedProjectStaysCurrentUntilExplicitDeallocation() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Closing"));
        allocate(workspace, projectId, workspace.employee().userId(), 4);

        patchProjectExpectOk(workspace.pm().token(), projectId, Map.of("status", "CLOSING"));
        patchProjectExpectOk(workspace.pm().token(), projectId, Map.of("status", "CLOSED"));

        // The split follows deallocatedAt, never the project status.
        JsonNode response = myProjectsJson(workspace.employee().token());
        assertThat(response.get("currentProjects")).hasSize(1);
        assertThat(response.get("currentProjects").get(0).get("projectStatus").asText())
            .isEqualTo("CLOSED");
        assertThat(response.get("pastProjects")).isEmpty();
    }

    @Test
    void reassignmentKeepsOneItemPerEpisode() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Episodes"));
        UUID employeeId = workspace.employee().userId();

        UUID firstEpisode = allocate(workspace, projectId, employeeId, 4);
        deallocate(workspace, projectId, firstEpisode);
        UUID secondEpisode = allocate(workspace, projectId, employeeId, 6);

        JsonNode response = myProjectsJson(workspace.employee().token());
        assertThat(response.get("currentProjects")).hasSize(1);
        assertThat(response.get("currentProjects").get(0).get("allocationId").asText())
            .isEqualTo(secondEpisode.toString());
        assertThat(response.get("currentProjects").get(0).get("workHoursPerDay").asInt())
            .isEqualTo(6);
        assertThat(response.get("pastProjects")).hasSize(1);
        assertThat(response.get("pastProjects").get(0).get("allocationId").asText())
            .isEqualTo(firstEpisode.toString());
        assertThat(response.get("pastProjects").get(0).get("workHoursPerDay").asInt())
            .isEqualTo(4);
    }

    @Test
    void viewIsSelfScopedAndAllocationBased() throws Exception {
        Workspace workspace = newWorkspace();
        Org orgB = newOrg();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Scoped"));
        allocate(workspace, projectId, workspace.employee().userId(), 4);

        // Query parameters cannot redirect the view to another user.
        String body = mockMvc.perform(get("/me/projects")
                .param("userId", workspace.employee().userId().toString())
                .param("employeeId", workspace.employee().userId().toString())
                .header(HttpHeaders.AUTHORIZATION, bearer(workspace.pm().token())))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        JsonNode pmView = objectMapper.readTree(body);
        assertThat(pmView.get("userId").asText())
            .isEqualTo(workspace.pm().userId().toString());

        // Ownership grants nothing here: the owning PM has no allocation.
        assertThat(pmView.get("currentProjects")).isEmpty();
        assertThat(pmView.get("pastProjects")).isEmpty();

        // Cross-org employees see only their own (empty) history.
        Member foreign = newEmployee(orgB, "foreign");
        JsonNode foreignView = myProjectsJson(foreign.token());
        assertThat(foreignView.get("currentProjects")).isEmpty();
        assertThat(foreignView.get("pastProjects")).isEmpty();

        // Platform admin without organization context gets the controlled 400.
        mockMvc.perform(get("/me/projects")
                .header(HttpHeaders.AUTHORIZATION, bearer(systemAdminAccessToken())))
            .andExpect(status().isBadRequest());
        mockMvc.perform(get("/me/projects")).andExpect(status().isUnauthorized());
    }
}
