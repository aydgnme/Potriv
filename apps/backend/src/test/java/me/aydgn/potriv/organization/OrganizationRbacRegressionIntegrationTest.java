package me.aydgn.potriv.organization;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

class OrganizationRbacRegressionIntegrationTest
    extends AbstractOrganizationStructureIntegrationTest {

    @Test
    void organizationAdminManagesTeamRolesAndDepartments() throws Exception {
        Org org = newOrg();
        createTeamRole(org.adminToken(), "Backend Developer").andExpect(status().isCreated());
        mockMvc.perform(post("/departments")
                .header(HttpHeaders.AUTHORIZATION, bearer(org.adminToken()))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(java.util.Map.of("name", "Engineering"))))
            .andExpect(status().isCreated());
    }

    @Test
    void departmentManagerCannotManageTeamRoleConfigOrDepartments() throws Exception {
        Org org = newOrg();
        UUID dept = createDepartment(org.adminToken(), "Engineering");
        Manager manager = newDepartmentManager(org, "manager");
        assignManager(org.adminToken(), dept, manager.userId()).andExpect(status().isOk());

        // Team-role configuration is organization-admin only.
        createTeamRole(manager.token(), "Sneaky").andExpect(status().isForbidden());

        // Department create/delete are organization-admin only.
        mockMvc.perform(post("/departments")
                .header(HttpHeaders.AUTHORIZATION, bearer(manager.token()))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(java.util.Map.of("name", "Rogue"))))
            .andExpect(status().isForbidden());
        mockMvc.perform(delete("/departments/" + dept)
                .header(HttpHeaders.AUTHORIZATION, bearer(manager.token())))
            .andExpect(status().isForbidden());
    }

    @Test
    void employeeCannotAccessOrganizationAdministration() throws Exception {
        Org org = newOrg();
        Employee employee = newEmployee(org, "emp");
        String token = tokenFor(employee.email());

        mockMvc.perform(get("/team-roles")
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isForbidden());
        mockMvc.perform(get("/departments")
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isForbidden());
    }

    @Test
    void systemAdminWithoutOrganizationHasNoImplicitCurrentOrgAccess() throws Exception {
        String systemAdmin = systemAdminAccessToken();

        mockMvc.perform(get("/team-roles")
                .header(HttpHeaders.AUTHORIZATION, bearer(systemAdmin)))
            .andExpect(status().isBadRequest());
        mockMvc.perform(get("/departments")
                .header(HttpHeaders.AUTHORIZATION, bearer(systemAdmin)))
            .andExpect(status().isBadRequest());
        // Membership routes are department-manager gated; a platform admin still
        // resolves no current organization and is not granted implicit access.
        mockMvc.perform(get("/departments/unassigned-employees")
                .header(HttpHeaders.AUTHORIZATION, bearer(systemAdmin)))
            .andExpect(status().isBadRequest());
    }
}
