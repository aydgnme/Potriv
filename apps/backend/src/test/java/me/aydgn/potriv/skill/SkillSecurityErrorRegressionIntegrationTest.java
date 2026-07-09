package me.aydgn.potriv.skill;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

class SkillSecurityErrorRegressionIntegrationTest extends AbstractSkillIntegrationTest {

    @Test
    void unauthenticatedProtectedEndpointReturnsJson401() throws Exception {
        mockMvc.perform(get("/skills"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.status").value(401));
        mockMvc.perform(get("/me/skills"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.status").value(401));
    }

    @Test
    void insufficientWriteRoleReturnsJson403() throws Exception {
        Org org = newOrg();
        Employee employee = newEmployee(org, "emp");
        createCategory(tokenFor(employee.email()), "Sneaky")
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.status").value(403));
    }

    @Test
    void duplicateNormalizedValueReturnsConflict() throws Exception {
        Manager manager = newDepartmentManager(newOrg(), "mgr");
        createCategory(manager.token(), "Database").andExpect(status().isCreated());
        createCategory(manager.token(), "database").andExpect(status().isConflict());
    }

    @Test
    void malformedUuidDoesNotReturn500() throws Exception {
        Manager manager = newDepartmentManager(newOrg(), "mgr");
        mockMvc.perform(get("/skills/not-a-uuid")
                .header(HttpHeaders.AUTHORIZATION, bearer(manager.token())))
            .andExpect(status().isBadRequest());
    }

    @Test
    void invalidEnumDoesNotReturn500() throws Exception {
        Org org = newOrg();
        Manager manager = newDepartmentManager(org, "mgr");
        UUID skillId = createSkillId(
            manager.token(), createCategoryId(manager.token(), "Programming Language"),
            "Java", null);
        Employee employee = newEmployee(org, "emp");

        mockMvc.perform(post("/me/skills")
                .header(HttpHeaders.AUTHORIZATION, bearer(tokenFor(employee.email())))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "skillId", skillId.toString(), "level", "WIZARD",
                    "experience", "ONE_TO_TWO_YEARS"))))
            .andExpect(status().isBadRequest());
    }

    @Test
    void crossOrgProbingReturns404() throws Exception {
        Manager managerA = newDepartmentManager(newOrg(), "a");
        UUID skillId = createSkillId(
            managerA.token(), createCategoryId(managerA.token(), "Programming Language"),
            "Java", null);

        Manager managerB = newDepartmentManager(newOrg(), "b");
        mockMvc.perform(get("/skills/" + skillId)
                .header(HttpHeaders.AUTHORIZATION, bearer(managerB.token())))
            .andExpect(status().isNotFound());
    }

    @Test
    void platformSystemAdminWithoutOrganizationHasNoImplicitSkillAccess() throws Exception {
        String token = systemAdminAccessToken();
        mockMvc.perform(get("/skills")
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isBadRequest());
        mockMvc.perform(get("/me/skills")
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isBadRequest());
        mockMvc.perform(get("/skill-categories")
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isBadRequest());
    }
}
