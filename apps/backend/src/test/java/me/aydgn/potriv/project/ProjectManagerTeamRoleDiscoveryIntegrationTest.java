package me.aydgn.potriv.project;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * The reason a project manager may read the team-role catalogue.
 *
 * <p>Project role requirements are catalog-backed — {@code teamRoles[].teamRoleId}
 * refers to a row only an organization admin creates — so a project manager who
 * cannot list the catalogue cannot state a requirement at all. The permission and
 * the workflow it exists for are asserted together here, so removing the read
 * access fails a test that says why it mattered rather than one about roles.
 *
 * <p>The rules for selecting inactive roles are unchanged and are covered by
 * {@code ProjectLifecycleValidationIntegrationTest}; what is added here is that
 * the catalogue read a project manager performs agrees with them.
 */
class ProjectManagerTeamRoleDiscoveryIntegrationTest extends AbstractProjectLifecycleIntegrationTest {

    private JsonNode listTeamRoles(String token, boolean includeInactive) throws Exception {
        String body = mockMvc.perform(get("/team-roles")
                .param("includeInactive", String.valueOf(includeInactive))
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body);
    }

    private static List<String> idsOf(JsonNode roles) {
        List<String> ids = new ArrayList<>();
        roles.forEach(role -> ids.add(role.get("teamRoleId").asText()));
        return ids;
    }

    @Test
    void projectManagerDiscoversATeamRoleAndCreatesAProjectWithIt() throws Exception {
        Org org = newOrg();
        UUID teamRoleId = createTeamRoleId(org.adminToken(), uniqueName("Backend"));
        Member projectManager = newProjectManager(org, "pm");

        // Discovered through the catalogue, not passed in by the test.
        JsonNode catalogue = listTeamRoles(projectManager.token(), false);
        assertThat(idsOf(catalogue)).contains(teamRoleId.toString());
        String discoveredId = catalogue.get(0).get("teamRoleId").asText();

        Map<String, Object> payload = projectPayload(uniqueName("Discovered"));
        payload.put("teamRoles", List.of(
            Map.of("teamRoleId", discoveredId, "requiredMembers", 2)));

        JsonNode created = createProjectExpectCreated(projectManager.token(), payload);
        JsonNode requirement = created.get("teamRoles").get(0);
        assertThat(requirement.get("teamRoleId").asText()).isEqualTo(teamRoleId.toString());
        assertThat(requirement.get("requiredMembers").asInt()).isEqualTo(2);
    }

    @Test
    void aDeactivatedRoleLeavesTheDefaultCatalogueButStaysOnItsProject() throws Exception {
        Org org = newOrg();
        UUID teamRoleId = createTeamRoleId(org.adminToken(), uniqueName("Backend"));
        Member projectManager = newProjectManager(org, "pm");

        Map<String, Object> payload = projectPayload(uniqueName("Legacy"));
        payload.put("teamRoles", List.of(
            Map.of("teamRoleId", teamRoleId.toString(), "requiredMembers", 1)));
        UUID projectId = createProjectId(projectManager.token(), payload);

        deactivateTeamRole(org.adminToken(), teamRoleId);

        // Gone from what may be newly selected …
        assertThat(idsOf(listTeamRoles(projectManager.token(), false)))
            .doesNotContain(teamRoleId.toString());

        // … but still findable, which is what an edit form needs to render a
        // requirement the project already has.
        JsonNode all = listTeamRoles(projectManager.token(), true);
        assertThat(idsOf(all)).contains(teamRoleId.toString());
        assertThat(all.get(0).get("active").asBoolean()).isFalse();

        // And the project itself still names the attached role.
        String body = getProject(projectManager.token(), projectId)
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        JsonNode requirement = objectMapper.readTree(body).get("teamRoles").get(0);
        assertThat(requirement.get("teamRoleId").asText()).isEqualTo(teamRoleId.toString());
        assertThat(requirement.get("active").asBoolean()).isFalse();
    }
}
