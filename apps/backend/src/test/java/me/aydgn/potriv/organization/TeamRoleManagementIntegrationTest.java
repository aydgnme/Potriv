package me.aydgn.potriv.organization;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;
import me.aydgn.potriv.organization.entity.TeamRole;
import me.aydgn.potriv.organization.repository.TeamRoleRepository;

class TeamRoleManagementIntegrationTest extends AbstractMockMvcIntegrationTest {

    @Autowired
    private TeamRoleRepository teamRoleRepository;

    @Test
    void orgAdminCreatesTeamRoleWithUuidIdAndCorrectResponse() throws Exception {
        String token = orgAdminToken();

        String response = createTeamRole(token, "Backend Developer", "Builds APIs")
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.name").value("Backend Developer"))
            .andExpect(jsonPath("$.description").value("Builds APIs"))
            .andExpect(jsonPath("$.active").value(true))
            .andExpect(jsonPath("$.createdAt").exists())
            .andReturn().getResponse().getContentAsString();

        JsonNode body = objectMapper.readTree(response);
        UUID id = UUID.fromString(body.get("teamRoleId").asText());
        assertThat(teamRoleRepository.findById(id)).isPresent();
        // normalizedName is an internal field and must not leak.
        assertThat(body.has("normalizedName")).isFalse();
    }

    @Test
    void caseInsensitiveSameOrgDuplicateIsRejected() throws Exception {
        String token = orgAdminToken();
        createTeamRole(token, "QA Engineer", null).andExpect(status().isCreated());

        createTeamRole(token, "  qa engineer ", null)
            .andExpect(status().isConflict());
    }

    @Test
    void sameNameInAnotherOrganizationIsAllowed() throws Exception {
        createTeamRole(orgAdminToken(), "Scrum Master", null).andExpect(status().isCreated());
        createTeamRole(orgAdminToken(), "Scrum Master", null).andExpect(status().isCreated());
    }

    @Test
    void listReturnsActiveOnlyByDefaultAndIncludeInactiveReturnsAll() throws Exception {
        String token = orgAdminToken();
        UUID activeId = createdId(createTeamRole(token, "Frontend Developer", null));
        UUID inactiveId = createdId(createTeamRole(token, "Legacy Role", null));
        deleteTeamRole(token, inactiveId).andExpect(status().isNoContent());

        String activeList = mockMvc.perform(get("/team-roles")
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(idsOf(activeList)).contains(activeId.toString()).doesNotContain(inactiveId.toString());

        String allList = mockMvc.perform(get("/team-roles")
                .param("includeInactive", "true")
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(idsOf(allList)).contains(activeId.toString(), inactiveId.toString());
    }

    @Test
    void detailIsTenantScopedAndCrossOrgReturns404() throws Exception {
        String tokenA = orgAdminToken();
        UUID roleId = createdId(createTeamRole(tokenA, "UX Designer", null));

        mockMvc.perform(get("/team-roles/" + roleId)
                .header(HttpHeaders.AUTHORIZATION, bearer(tokenA)))
            .andExpect(status().isOk());

        String tokenB = orgAdminToken();
        mockMvc.perform(get("/team-roles/" + roleId)
                .header(HttpHeaders.AUTHORIZATION, bearer(tokenB)))
            .andExpect(status().isNotFound());
    }

    @Test
    void patchUpdatesNameDescriptionAndReactivation() throws Exception {
        String token = orgAdminToken();
        UUID id = createdId(createTeamRole(token, "Tech Lead", "old"));

        patchTeamRole(token, id, Map.of("name", "Technical Lead"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("Technical Lead"));

        patchTeamRole(token, id, Map.of("description", "leads architecture"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.description").value("leads architecture"));

        deleteTeamRole(token, id).andExpect(status().isNoContent());
        patchTeamRole(token, id, Map.of("active", true))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.active").value(true));
    }

    @Test
    void deleteDeactivatesIsIdempotentAndRowRemainsInRepository() throws Exception {
        String token = orgAdminToken();
        UUID id = createdId(createTeamRole(token, "Release Manager", null));

        deleteTeamRole(token, id).andExpect(status().isNoContent());
        deleteTeamRole(token, id).andExpect(status().isNoContent());

        // Non-destructive: the row stays resolvable and inactive.
        assertThat(teamRoleRepository.findById(id))
            .isPresent()
            .get()
            .extracting(TeamRole::isActive)
            .isEqualTo(false);

        mockMvc.perform(get("/team-roles/" + id)
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isOk());
    }

    @Test
    void employeeReceives403() throws Exception {
        String employeeToken = employeeTokenInNewOrg();
        mockMvc.perform(get("/team-roles")
                .header(HttpHeaders.AUTHORIZATION, bearer(employeeToken)))
            .andExpect(status().isForbidden());
    }

    @Test
    void platformSystemAdminWithoutOrganizationReceivesControlledError() throws Exception {
        mockMvc.perform(get("/team-roles")
                .header(HttpHeaders.AUTHORIZATION, bearer(systemAdminAccessToken())))
            .andExpect(status().isBadRequest());
    }

    @Test
    void teamRoleIsNeverAGrantedAuthority() throws Exception {
        // Team roles are informational and carry no permissions. Even with team
        // roles present in the organization, a plain employee cannot reach any
        // organization-admin operation — team-role names never become authorities.
        String adminToken = orgAdminTokenForOrg("AuthorityOrg");
        createTeamRole(adminToken, "ORGANIZATION_ADMIN", null).andExpect(status().isCreated());
        createTeamRole(adminToken, "SYSTEM_ADMIN", null).andExpect(status().isCreated());

        String employeeToken = employeeTokenInSameOrgAs(adminToken);
        mockMvc.perform(post("/team-roles")
                .header(HttpHeaders.AUTHORIZATION, bearer(employeeToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("name", "Sneaky"))))
            .andExpect(status().isForbidden());
    }

    // ---- helpers ----

    private ResultActions createTeamRole(String token, String name, String description)
        throws Exception {
        var payload = new java.util.HashMap<String, Object>();
        payload.put("name", name);
        if (description != null) {
            payload.put("description", description);
        }
        return mockMvc.perform(post("/team-roles")
            .header(HttpHeaders.AUTHORIZATION, bearer(token))
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(payload)));
    }

    private ResultActions patchTeamRole(String token, UUID id, Map<String, Object> body)
        throws Exception {
        return mockMvc.perform(patch("/team-roles/" + id)
            .header(HttpHeaders.AUTHORIZATION, bearer(token))
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(body)));
    }

    private ResultActions deleteTeamRole(String token, UUID id) throws Exception {
        return mockMvc.perform(delete("/team-roles/" + id)
            .header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }

    private UUID createdId(ResultActions creation) throws Exception {
        String body = creation.andReturn().getResponse().getContentAsString();
        return UUID.fromString(objectMapper.readTree(body).get("teamRoleId").asText());
    }

    private java.util.List<String> idsOf(String jsonArray) throws Exception {
        JsonNode array = objectMapper.readTree(jsonArray);
        java.util.List<String> ids = new java.util.ArrayList<>();
        array.forEach(node -> ids.add(node.get("teamRoleId").asText()));
        return ids;
    }

    private String orgAdminToken() throws Exception {
        return orgAdminTokenForOrg("Org");
    }

    private String orgAdminTokenForOrg(String orgPrefix) throws Exception {
        String email = uniqueEmail("admin");
        registerAdmin(uniqueName(orgPrefix), email, "Password123!");
        return loginForAccessToken(email, "Password123!");
    }

    private String employeeTokenInNewOrg() throws Exception {
        JsonNode admin = registerAdmin(uniqueName("Org"), uniqueEmail("admin"), "Password123!");
        String employeeEmail = uniqueEmail("employee");
        registerEmployee(extractInviteToken(admin.get("employeeInviteUrl").asText()),
            employeeEmail, "Password123!");
        return loginForAccessToken(employeeEmail, "Password123!");
    }

    private String employeeTokenInSameOrgAs(String adminToken) throws Exception {
        // Fetch the admin's org invite and register an employee under it.
        String inviteResponse = mockMvc.perform(get("/organizations/current/invite")
                .header(HttpHeaders.AUTHORIZATION, bearer(adminToken)))
            .andReturn().getResponse().getContentAsString();
        String inviteToken = extractInviteToken(
            objectMapper.readTree(inviteResponse).get("inviteUrl").asText());
        String employeeEmail = uniqueEmail("employee");
        registerEmployee(inviteToken, employeeEmail, "Password123!");
        return loginForAccessToken(employeeEmail, "Password123!");
    }
}
