package me.aydgn.potriv.organization;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Who may read the team-role catalogue, and who may change it.
 *
 * <p>A project manager states a project's role requirements, and those
 * requirements are catalog-backed: {@code teamRoles[].teamRoleId} refers to a row
 * only an organization admin can create. Until this split existed, a pure project
 * manager could own the requirements while being unable to see the vocabulary they
 * are written in, which made a correct project form impossible to build.
 *
 * <p>Reading is not owning. Everything that changes the catalogue stays with the
 * organization admin, and each case below runs through the real security chain
 * rather than calling the service directly.
 */
class TeamRoleReadAccessIntegrationTest extends AbstractOrganizationStructureIntegrationTest {

    private Manager newProjectManager(Org org, String prefix) throws Exception {
        Employee employee = newEmployee(org, prefix);
        grantRoles(org.adminToken(), employee.userId(), List.of("EMPLOYEE", "PROJECT_MANAGER"));
        return new Manager(employee.userId(), employee.email(), tokenFor(employee.email()));
    }

    private UUID createTeamRoleId(String adminToken, String name) throws Exception {
        String body = createTeamRole(adminToken, name)
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        return UUID.fromString(objectMapper.readTree(body).get("teamRoleId").asText());
    }

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

    // ── Reading ─────────────────────────────────────────────────────────────

    @Test
    void organizationAdminStillReadsTheCatalogue() throws Exception {
        Org org = newOrg();
        createTeamRoleId(org.adminToken(), uniqueName("Backend"));

        assertThat(listTeamRoles(org.adminToken(), false)).hasSize(1);
    }

    @Test
    void projectManagerReadsTheCatalogue() throws Exception {
        // The whole point of this change: a pure project manager can see the
        // vocabulary their project requirements are written in.
        Org org = newOrg();
        UUID teamRoleId = createTeamRoleId(org.adminToken(), uniqueName("Backend"));
        Manager projectManager = newProjectManager(org, "pm");

        assertThat(idsOf(listTeamRoles(projectManager.token(), false)))
            .containsExactly(teamRoleId.toString());
    }

    @Test
    void projectManagerReadsTheCatalogueIncludingInactiveRoles() throws Exception {
        // Editing a project whose role was deactivated afterwards has to be able to
        // render what is already attached.
        Org org = newOrg();
        UUID teamRoleId = createTeamRoleId(org.adminToken(), uniqueName("Backend"));
        Manager projectManager = newProjectManager(org, "pm");

        mockMvc.perform(delete("/team-roles/" + teamRoleId)
                .header(HttpHeaders.AUTHORIZATION, bearer(org.adminToken())))
            .andExpect(status().isNoContent());

        assertThat(listTeamRoles(projectManager.token(), false)).isEmpty();

        JsonNode all = listTeamRoles(projectManager.token(), true);
        assertThat(idsOf(all)).containsExactly(teamRoleId.toString());
        assertThat(all.get(0).get("active").asBoolean()).isFalse();
    }

    @Test
    void aUserHoldingEmployeeAndProjectManagerReads() throws Exception {
        // Roles are a union: holding an ordinary role alongside cannot take the
        // capability away.
        Org org = newOrg();
        createTeamRoleId(org.adminToken(), uniqueName("Backend"));
        Manager projectManager = newProjectManager(org, "pm");

        assertThat(listTeamRoles(projectManager.token(), false)).hasSize(1);
    }

    @Test
    void employeeOnlyIsStillRefused() throws Exception {
        Org org = newOrg();
        Employee employee = newEmployee(org, "emp");

        mockMvc.perform(get("/team-roles")
                .header(HttpHeaders.AUTHORIZATION, bearer(tokenFor(employee.email()))))
            .andExpect(status().isForbidden());
    }

    @Test
    void departmentManagerOnlyIsStillRefused() throws Exception {
        // Department managers review staffing; they do not author project
        // requirements, so nothing here widened for them.
        Org org = newOrg();
        Manager departmentManager = newDepartmentManager(org, "dm");

        mockMvc.perform(get("/team-roles")
                .header(HttpHeaders.AUTHORIZATION, bearer(departmentManager.token())))
            .andExpect(status().isForbidden());
    }

    @Test
    void anonymousIsUnauthorized() throws Exception {
        mockMvc.perform(get("/team-roles"))
            .andExpect(status().isUnauthorized());
    }

    // ── Not owning ──────────────────────────────────────────────────────────

    @Test
    void projectManagerCannotAdministerTheCatalogue() throws Exception {
        Org org = newOrg();
        UUID teamRoleId = createTeamRoleId(org.adminToken(), uniqueName("Backend"));
        Manager projectManager = newProjectManager(org, "pm");
        String token = bearer(projectManager.token());

        // The admin detail read belongs to organization management, not to
        // authoring a project.
        mockMvc.perform(get("/team-roles/" + teamRoleId)
                .header(HttpHeaders.AUTHORIZATION, token))
            .andExpect(status().isForbidden());

        mockMvc.perform(post("/team-roles")
                .header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("name", uniqueName("Rogue")))))
            .andExpect(status().isForbidden());

        mockMvc.perform(patch("/team-roles/" + teamRoleId)
                .header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("name", uniqueName("Renamed")))))
            .andExpect(status().isForbidden());

        mockMvc.perform(delete("/team-roles/" + teamRoleId)
                .header(HttpHeaders.AUTHORIZATION, token))
            .andExpect(status().isForbidden());

        // Refused, not quietly ignored: the role is untouched afterwards.
        assertThat(listTeamRoles(org.adminToken(), false).get(0).get("active").asBoolean())
            .isTrue();
    }

    // ── Tenancy ─────────────────────────────────────────────────────────────

    @Test
    void projectManagerSeesOnlyTheirOwnOrganizationsRoles() throws Exception {
        Org orgA = newOrg("OrgA");
        Org orgB = newOrg("OrgB");
        UUID roleA = createTeamRoleId(orgA.adminToken(), uniqueName("BackendA"));
        UUID inactiveA = createTeamRoleId(orgA.adminToken(), uniqueName("RetiredA"));
        UUID roleB = createTeamRoleId(orgB.adminToken(), uniqueName("BackendB"));

        mockMvc.perform(delete("/team-roles/" + inactiveA)
                .header(HttpHeaders.AUTHORIZATION, bearer(orgA.adminToken())))
            .andExpect(status().isNoContent());

        Manager projectManagerA = newProjectManager(orgA, "pmA");

        // Even the widest read this endpoint offers stays inside one organization.
        List<String> visible = idsOf(listTeamRoles(projectManagerA.token(), true));
        assertThat(visible).containsExactlyInAnyOrder(roleA.toString(), inactiveA.toString());
        assertThat(visible).doesNotContain(roleB.toString());
    }
}
