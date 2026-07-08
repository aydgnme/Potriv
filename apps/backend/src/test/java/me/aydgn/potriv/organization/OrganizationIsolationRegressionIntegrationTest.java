package me.aydgn.potriv.organization;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;

import com.fasterxml.jackson.databind.JsonNode;

class OrganizationIsolationRegressionIntegrationTest
    extends AbstractOrganizationStructureIntegrationTest {

    @Test
    void organizationAdminNeverSeesAnotherOrganizationsTeamRolesOrDepartments() throws Exception {
        Org orgA = newOrg("OrgA");
        Org orgB = newOrg("OrgB");

        UUID teamRoleB = createdTeamRoleId(createTeamRole(orgB.adminToken(), "Backend Developer"));
        UUID deptB = createDepartment(orgB.adminToken(), "Engineering");

        // Listings are tenant-scoped.
        assertThat(teamRoleIds(orgA.adminToken())).doesNotContain(teamRoleB.toString());
        assertThat(departmentIds(orgA.adminToken())).doesNotContain(deptB.toString());

        // Cross-org UUID probing returns 404, never leaking existence.
        mockMvc.perform(get("/team-roles/" + teamRoleB)
                .header(HttpHeaders.AUTHORIZATION, bearer(orgA.adminToken())))
            .andExpect(status().isNotFound());
        mockMvc.perform(get("/departments/" + deptB)
                .header(HttpHeaders.AUTHORIZATION, bearer(orgA.adminToken())))
            .andExpect(status().isNotFound());
    }

    @Test
    void managerCannotSeeOrManageAnotherOrganizationsUsers() throws Exception {
        Org orgA = newOrg("OrgA");
        UUID deptA = createDepartment(orgA.adminToken(), "Engineering");
        Manager managerA = newDepartmentManager(orgA, "a");
        assignManager(orgA.adminToken(), deptA, managerA.userId()).andExpect(status().isOk());

        Org orgB = newOrg("OrgB");
        Employee employeeB = newEmployee(orgB, "b");

        // A's manager never lists B's users.
        assertThat(emailsOf(listUnassigned(managerA.token()))).doesNotContain(employeeB.email());

        // A's manager cannot add or remove a B user (anti-leak 404).
        addMember(managerA.token(), deptA, employeeB.userId()).andExpect(status().isNotFound());
        removeMember(managerA.token(), deptA, employeeB.userId()).andExpect(status().isNotFound());
    }

    private UUID createdTeamRoleId(org.springframework.test.web.servlet.ResultActions creation)
        throws Exception {
        String body = creation.andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        return UUID.fromString(objectMapper.readTree(body).get("teamRoleId").asText());
    }

    private List<String> teamRoleIds(String token) throws Exception {
        String body = mockMvc.perform(get("/team-roles")
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return idsOf(body, "teamRoleId");
    }

    private List<String> departmentIds(String token) throws Exception {
        String body = mockMvc.perform(get("/departments")
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return idsOf(body, "departmentId");
    }

    private List<String> idsOf(String jsonArray, String idField) throws Exception {
        JsonNode array = objectMapper.readTree(jsonArray);
        List<String> ids = new java.util.ArrayList<>();
        array.forEach(node -> ids.add(node.get(idField).asText()));
        return ids;
    }
}
