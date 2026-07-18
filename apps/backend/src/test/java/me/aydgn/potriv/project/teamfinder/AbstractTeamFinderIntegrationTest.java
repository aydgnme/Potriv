package me.aydgn.potriv.project.teamfinder;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.project.allocation.AbstractProjectAllocationIntegrationTest;

/**
 * Shared HTTP helpers for Team Finder integration tests: skill catalog setup,
 * target project creation, and running the finder.
 */
abstract class AbstractTeamFinderIntegrationTest extends AbstractProjectAllocationIntegrationTest {

    protected UUID createSkillCategoryId(String adminToken, String name) throws Exception {
        String body = mockMvc.perform(post("/skill-categories")
                .header(HttpHeaders.AUTHORIZATION, bearer(adminToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("name", name))))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        return UUID.fromString(objectMapper.readTree(body).get("categoryId").asText());
    }

    protected UUID createSkillId(String adminToken, UUID categoryId, String name)
        throws Exception {
        String body = mockMvc.perform(post("/skills")
                .header(HttpHeaders.AUTHORIZATION, bearer(adminToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "categoryId", categoryId.toString(), "name", name))))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        return UUID.fromString(objectMapper.readTree(body).get("skillId").asText());
    }

    protected void selfAssignSkill(String userToken, UUID skillId) throws Exception {
        mockMvc.perform(post("/me/skills")
                .header(HttpHeaders.AUTHORIZATION, bearer(userToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "skillId", skillId.toString(),
                    "level", "DOES",
                    "experience", "ONE_TO_TWO_YEARS"))))
            .andExpect(status().isCreated());
    }

    protected void deactivateSkill(String adminToken, UUID skillId) throws Exception {
        mockMvc.perform(patch("/skills/" + skillId)
                .header(HttpHeaders.AUTHORIZATION, bearer(adminToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("active", false))))
            .andExpect(status().isOk());
    }

    /**
     * A STARTING target project with the given free-text technologies and one
     * required member per given team role.
     */
    protected UUID createTargetProject(String pmToken, String name, List<String> technologies,
        List<UUID> teamRoleIds) throws Exception {
        Map<String, Object> payload = projectPayload(name);
        payload.put("status", "STARTING");
        payload.put("technologyStack", technologies);
        payload.put("teamRoles", teamRoleIds.stream()
            .map(roleId -> Map.of("teamRoleId", roleId.toString(), "requiredMembers", 1))
            .toList());
        return createProjectId(pmToken, payload);
    }

    protected ResultActions runTeamFinder(String token, UUID projectId, Map<String, Object> body)
        throws Exception {
        return mockMvc.perform(post("/projects/" + projectId + "/team-finder")
            .header(HttpHeaders.AUTHORIZATION, bearer(token))
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(body)));
    }

    protected JsonNode teamFinderJson(String token, UUID projectId, Map<String, Object> body)
        throws Exception {
        String response = runTeamFinder(token, projectId, body)
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response);
    }

    /** The candidate row for the given user, or null when absent. */
    protected JsonNode candidateOf(JsonNode response, UUID userId) {
        for (JsonNode candidate : response.get("candidates")) {
            if (candidate.get("employee").get("userId").asText().equals(userId.toString())) {
                return candidate;
            }
        }
        return null;
    }

    protected List<String> candidateUserIds(JsonNode response) {
        List<String> userIds = new java.util.ArrayList<>();
        response.get("candidates").forEach(
            candidate -> userIds.add(candidate.get("employee").get("userId").asText()));
        return userIds;
    }
}
