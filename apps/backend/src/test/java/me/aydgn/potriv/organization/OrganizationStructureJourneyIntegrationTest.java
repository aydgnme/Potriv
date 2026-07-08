package me.aydgn.potriv.organization;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;

/**
 * End-to-end organization journey exercising the full structure surface in one
 * ordered sequence.
 */
class OrganizationStructureJourneyIntegrationTest
    extends AbstractOrganizationStructureIntegrationTest {

    @Test
    void fullOrganizationStructureJourney() throws Exception {
        // 1. register org admin
        Org org = newOrg("JourneyOrg");

        // 2. create custom team roles
        createTeamRole(org.adminToken(), "Backend Developer").andExpect(status().isCreated());
        createTeamRole(org.adminToken(), "QA Engineer").andExpect(status().isCreated());

        // 3. create two departments
        UUID departmentA = createDepartment(org.adminToken(), "Engineering");
        UUID departmentB = createDepartment(org.adminToken(), "Design");

        // 4 & 5. register employee A and employee B
        Employee employeeA = newEmployee(org, "empa");
        Employee employeeB = newEmployee(org, "empb");

        // 6. grant DEPARTMENT_MANAGER to employee A via the role-management API
        grantRoles(org.adminToken(), employeeA.userId(), List.of("EMPLOYEE", "DEPARTMENT_MANAGER"));

        // 7. assign employee A as manager of department A
        assignManager(org.adminToken(), departmentA, employeeA.userId())
            .andExpect(status().isOk());

        // 8. login as employee A
        String managerToken = tokenFor(employeeA.email());

        // 9. list unassigned employees
        assertThat(emailsOf(listUnassigned(managerToken))).contains(employeeB.email());

        // 10. assign employee B to department A
        addMember(managerToken, departmentA, employeeB.userId()).andExpect(status().isOk());

        // 11. verify memberCount = 1
        assertThat(getDepartment(org.adminToken(), departmentA).get("memberCount").asLong())
            .isEqualTo(1);

        // 12. remove employee B
        removeMember(managerToken, departmentA, employeeB.userId())
            .andExpect(status().isNoContent());

        // 13. verify employee B is unassigned again
        assertThat(emailsOf(listUnassigned(managerToken))).contains(employeeB.email());
        assertThat(getDepartment(org.adminToken(), departmentA).get("memberCount").asLong())
            .isEqualTo(0);

        // 14. remove manager assignment
        unassignManager(org.adminToken(), departmentA).andExpect(status().isNoContent());

        // 15. delete empty department A
        mockMvc.perform(delete("/departments/" + departmentA)
                .header(HttpHeaders.AUTHORIZATION, bearer(org.adminToken())))
            .andExpect(status().isNoContent());

        // Department B was never touched and remains listable.
        assertThat(getDepartment(org.adminToken(), departmentB).get("memberCount").asLong())
            .isEqualTo(0);
    }
}
