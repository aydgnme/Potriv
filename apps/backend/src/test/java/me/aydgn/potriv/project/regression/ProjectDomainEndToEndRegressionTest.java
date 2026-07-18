package me.aydgn.potriv.project.regression;

import static org.assertj.core.api.Assertions.assertThat;
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
 * End-to-end Project domain journey: create → find → propose → accept →
 * views → deallocate → views → reassign. Catches mismatches between the
 * allocation workflow state and every view projection.
 */
class ProjectDomainEndToEndRegressionTest
    extends AbstractProjectDomainRegressionIntegrationTest {

    private UUID createSkillForOrg(Workspace workspace, String name) throws Exception {
        String categoryBody = mockMvc.perform(post("/skill-categories")
                .header(HttpHeaders.AUTHORIZATION, bearer(workspace.dm().token()))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("name", uniqueName("Cat")))))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        UUID categoryId =
            UUID.fromString(objectMapper.readTree(categoryBody).get("categoryId").asText());
        String skillBody = mockMvc.perform(post("/skills")
                .header(HttpHeaders.AUTHORIZATION, bearer(workspace.dm().token()))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "categoryId", categoryId.toString(), "name", name))))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        return UUID.fromString(objectMapper.readTree(skillBody).get("skillId").asText());
    }

    private JsonNode runTeamFinder(String pmToken, UUID projectId) throws Exception {
        String body = mockMvc.perform(post("/projects/" + projectId + "/team-finder")
                .header(HttpHeaders.AUTHORIZATION, bearer(pmToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body);
    }

    @Test
    void fullWorkflowStaysConsistentAcrossAllViews() throws Exception {
        // 1-3: organization, department, manager, member, role, and skill.
        Workspace workspace = newWorkspace();
        UUID employeeId = workspace.employee().userId();
        UUID javaSkill = createSkillForOrg(workspace, "Java");
        mockMvc.perform(post("/me/skills")
                .header(HttpHeaders.AUTHORIZATION, bearer(workspace.employee().token()))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "skillId", javaSkill.toString(),
                    "level", "DOES",
                    "experience", "ONE_TO_TWO_YEARS"))))
            .andExpect(status().isCreated());

        // 4-5: an active FIXED project with technology and role requirements.
        Map<String, Object> payload = projectPayload(uniqueName("Journey"));
        payload.put("status", "STARTING");
        payload.put("technologyStack", List.of("Java"));
        payload.put("teamRoles", List.of(
            Map.of("teamRoleId", workspace.teamRoleId().toString(), "requiredMembers", 1)));
        UUID projectId = createProjectId(workspace.pm().token(), payload);

        // 6: the Team Finder surfaces the skilled, available employee.
        JsonNode finder = runTeamFinder(workspace.pm().token(), projectId);
        assertThat(finder.get("candidates")).anySatisfy(candidate ->
            assertThat(candidate.get("employee").get("userId").asText())
                .isEqualTo(employeeId.toString()));

        // 7-8: proposal appears in the DM queue and is accepted.
        UUID proposalId = proposeAssignmentId(workspace.pm().token(), projectId, employeeId, 8,
            List.of(workspace.teamRoleId()));
        JsonNode queue = proposalQueueJson(workspace.dm().token(), null);
        assertThat(queue).hasSize(1);
        assertThat(queue.get(0).get("proposalId").asText()).isEqualTo(proposalId.toString());
        UUID allocationId =
            acceptAssignmentForAllocationId(workspace.dm().token(), proposalId);

        // 9: the active allocation is projected into every view.
        assertThat(memberOf(teamViewJson(workspace.pm().token(), projectId)
            .get("activeMembers"), employeeId)).isNotNull();
        JsonNode myProjects = myProjectsJson(workspace.employee().token());
        assertThat(myProjects.get("currentProjects")).hasSize(1);
        assertThat(myProjects.get("currentProjects").get(0).get("allocationId").asText())
            .isEqualTo(allocationId.toString());
        JsonNode portfolio = departmentProjectsJson(workspace.dm().token(), null);
        assertThat(portfolio.get("projects")).hasSize(1);
        assertThat(memberOf(portfolio.get("projects").get(0).get("teamMembers"), employeeId))
            .isNotNull();
        assertThat(memberOf(projectDetailsJson(workspace.pm().token(), projectId)
            .get("activeMembers"), employeeId)).isNotNull();

        // At 8h the employee has no capacity for any other consuming project.
        UUID sideProject = createConsumingProject(workspace.pm().token(), uniqueName("Side"));
        proposeAssignment(workspace.pm().token(), sideProject, employeeId, 1,
                List.of(workspace.teamRoleId()))
            .andExpect(status().isConflict());

        // 10-11: deallocation is proposed and accepted.
        UUID deallocation = proposeDeallocationId(workspace.pm().token(), projectId,
            allocationId, "Journey complete");
        acceptDeallocation(workspace.dm().token(), deallocation).andExpect(status().isOk());

        // 12: the episode moves to the past sections everywhere.
        JsonNode teamAfter = teamViewJson(workspace.pm().token(), projectId);
        assertThat(teamAfter.get("activeMembers")).isEmpty();
        assertThat(memberOf(teamAfter.get("pastMembers"), employeeId)).isNotNull();
        JsonNode historyAfter = myProjectsJson(workspace.employee().token());
        assertThat(historyAfter.get("currentProjects")).isEmpty();
        assertThat(historyAfter.get("pastProjects")).hasSize(1);
        JsonNode detailsAfter = projectDetailsJson(workspace.pm().token(), projectId);
        assertThat(detailsAfter.get("activeMembers")).isEmpty();
        assertThat(memberOf(detailsAfter.get("pastMembers"), employeeId)).isNotNull();

        // 13: the department portfolio no longer includes the project.
        assertThat(departmentProjectsJson(workspace.dm().token(), null).get("projects"))
            .isEmpty();

        // 14: capacity is released; reassignment creates a fresh episode that
        // shows up as current again next to the preserved past episode.
        UUID newEpisode = allocate(workspace, projectId, employeeId, 4);
        assertThat(newEpisode).isNotEqualTo(allocationId);
        JsonNode reassigned = myProjectsJson(workspace.employee().token());
        assertThat(reassigned.get("currentProjects")).hasSize(1);
        assertThat(reassigned.get("currentProjects").get(0).get("allocationId").asText())
            .isEqualTo(newEpisode.toString());
        assertThat(reassigned.get("pastProjects")).hasSize(1);
        assertThat(reassigned.get("pastProjects").get(0).get("allocationId").asText())
            .isEqualTo(allocationId.toString());
        JsonNode teamReassigned = teamViewJson(workspace.pm().token(), projectId);
        assertThat(memberOf(teamReassigned.get("activeMembers"), employeeId)).isNotNull();
        assertThat(memberOf(teamReassigned.get("pastMembers"), employeeId)).isNotNull();
    }
}
