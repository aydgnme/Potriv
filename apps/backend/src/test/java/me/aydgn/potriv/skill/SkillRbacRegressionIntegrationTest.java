package me.aydgn.potriv.skill;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

class SkillRbacRegressionIntegrationTest extends AbstractSkillIntegrationTest {

    @Test
    void onlyDepartmentManagersConfigureCategoriesAndSkills() throws Exception {
        Org org = newOrg();
        Manager manager = newDepartmentManager(org, "mgr");

        // DEPARTMENT_MANAGER can create a category and a skill.
        UUID categoryId = createCategoryId(manager.token(), "Programming Language");
        UUID skillId = createSkillId(manager.token(), categoryId, "Java", null);

        // EMPLOYEE cannot create a category.
        Employee employee = newEmployee(org, "emp");
        createCategory(tokenFor(employee.email()), "Sneaky").andExpect(status().isForbidden());

        // ORGANIZATION_ADMIN (without DEPARTMENT_MANAGER) cannot create a category.
        createCategory(org.adminToken(), "AdminCat").andExpect(status().isForbidden());

        // PROJECT_MANAGER (without DEPARTMENT_MANAGER) cannot create a category.
        Employee pm = newEmployee(org, "pm");
        grantRoles(org.adminToken(), pm.userId(), List.of("EMPLOYEE", "PROJECT_MANAGER"));
        createCategory(tokenFor(pm.email()), "PmCat").andExpect(status().isForbidden());

        // Same-org users (including a non-author manager) can read the skill.
        mockMvc.perform(get("/skills/" + skillId)
                .header(HttpHeaders.AUTHORIZATION, bearer(tokenFor(employee.email()))))
            .andExpect(status().isOk());
        Manager otherManager = newDepartmentManager(org, "other");
        mockMvc.perform(get("/skills/" + skillId)
                .header(HttpHeaders.AUTHORIZATION, bearer(otherManager.token())))
            .andExpect(status().isOk());

        // Non-author cannot update/delete; author can.
        mockMvc.perform(patch("/skills/" + skillId)
                .header(HttpHeaders.AUTHORIZATION, bearer(otherManager.token()))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("name", "Nope"))))
            .andExpect(status().isForbidden());
        mockMvc.perform(delete("/skills/" + skillId)
                .header(HttpHeaders.AUTHORIZATION, bearer(otherManager.token())))
            .andExpect(status().isForbidden());
        mockMvc.perform(patch("/skills/" + skillId)
                .header(HttpHeaders.AUTHORIZATION, bearer(manager.token()))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("name", "Java SE"))))
            .andExpect(status().isOk());
    }

    @Test
    void linkingRequiresManagerAssignmentAndEmployeeCannotLink() throws Exception {
        Org org = newOrg();
        Manager author = newDepartmentManager(org, "author");
        UUID skillId = createSkillId(
            author.token(), createCategoryId(author.token(), "Programming Language"), "Java", null);
        UUID deptId = createDepartment(org.adminToken(), "Engineering");
        assignManager(org.adminToken(), deptId, author.userId());

        // Assigned manager links own department.
        mockMvc.perform(post("/skills/" + skillId + "/departments/current")
                .header(HttpHeaders.AUTHORIZATION, bearer(author.token())))
            .andExpect(status().isOk());

        // Role holder without assignment cannot link.
        Manager unassigned = newDepartmentManager(org, "unassigned");
        mockMvc.perform(post("/skills/" + skillId + "/departments/current")
                .header(HttpHeaders.AUTHORIZATION, bearer(unassigned.token())))
            .andExpect(status().isForbidden());

        // EMPLOYEE cannot link at all.
        Employee employee = newEmployee(org, "emp");
        mockMvc.perform(post("/skills/" + skillId + "/departments/current")
                .header(HttpHeaders.AUTHORIZATION, bearer(tokenFor(employee.email()))))
            .andExpect(status().isForbidden());
    }
}
