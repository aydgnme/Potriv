package me.aydgn.potriv.skill;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

import me.aydgn.potriv.skill.repository.EmployeeSkillRepository;
import me.aydgn.potriv.skill.repository.SkillCategoryRepository;
import me.aydgn.potriv.skill.repository.SkillDepartmentLinkRepository;
import me.aydgn.potriv.skill.repository.SkillRepository;

/**
 * The skill associations (department links, employee assignments) and the
 * organization associations (manager assignment, membership) are all independent.
 */
class SkillAssociationIndependenceIntegrationTest extends AbstractSkillIntegrationTest {

    @Autowired
    private EmployeeSkillRepository employeeSkillRepository;

    @Autowired
    private SkillDepartmentLinkRepository linkRepository;

    @Autowired
    private SkillRepository skillRepository;

    @Autowired
    private SkillCategoryRepository skillCategoryRepository;

    @Test
    void skillAndOrganizationAssociationsAreIndependent() throws Exception {
        Org org = newOrg();
        Manager manager = newDepartmentManager(org, "mgr");
        UUID deptId = createDepartment(org.adminToken(), "Engineering");
        assignManager(org.adminToken(), deptId, manager.userId());
        UUID categoryId = createCategoryId(manager.token(), "Programming Language");
        UUID skillId = createSkillId(manager.token(), categoryId, "Java", null);

        // Manager assignment created no EmployeeSkill and no SkillDepartmentLink.
        assertThat(hasEmployeeSkill(manager.userId(), skillId)).isFalse();
        assertThat(linkRepository.findBySkillIdWithDepartment(skillId)).isEmpty();

        // Linking the skill creates no EmployeeSkill (for the manager or a member).
        mockMvc.perform(post("/skills/" + skillId + "/departments/current")
                .header(HttpHeaders.AUTHORIZATION, bearer(manager.token())))
            .andExpect(status().isOk());
        assertThat(hasEmployeeSkill(manager.userId(), skillId)).isFalse();

        // Adding a department member does not assign the skill to them.
        Employee member = newEmployee(org, "member");
        mockMvc.perform(post("/departments/" + deptId + "/members/" + member.userId())
                .header(HttpHeaders.AUTHORIZATION, bearer(manager.token())))
            .andExpect(status().isOk());
        assertThat(hasEmployeeSkill(member.userId(), skillId)).isFalse();

        // The member self-assigns the skill; this creates no SkillDepartmentLink.
        String memberToken = tokenFor(member.email());
        UUID employeeSkillId = UUID.fromString(objectMapper.readTree(
            mockMvc.perform(post("/me/skills")
                    .header(HttpHeaders.AUTHORIZATION, bearer(memberToken))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsString(Map.of(
                        "skillId", skillId.toString(), "level", "DOES",
                        "experience", "ONE_TO_TWO_YEARS"))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString()).get("employeeSkillId").asText());
        assertThat(linkRepository.findBySkillIdWithDepartment(skillId)).hasSize(1);

        // Deactivating the category does not delete the skill.
        mockMvc.perform(delete("/skill-categories/" + categoryId)
                .header(HttpHeaders.AUTHORIZATION, bearer(manager.token())))
            .andExpect(status().isNoContent());
        assertThat(skillRepository.findById(skillId)).isPresent();
        assertThat(skillCategoryRepository.findById(categoryId)).isPresent();

        // Soft-deleting the skill keeps both the department link and the assignment.
        mockMvc.perform(delete("/skills/" + skillId)
                .header(HttpHeaders.AUTHORIZATION, bearer(manager.token())))
            .andExpect(status().isNoContent());
        assertThat(linkRepository.findBySkillIdWithDepartment(skillId)).hasSize(1);
        assertThat(employeeSkillRepository.findById(employeeSkillId)).isPresent();

        // Deleting the EmployeeSkill does not delete the skill.
        mockMvc.perform(delete("/me/skills/" + employeeSkillId)
                .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
            .andExpect(status().isNoContent());
        assertThat(skillRepository.findById(skillId)).isPresent();

        // Explicit unlink removes only the link (the skill and category remain).
        // Re-assign a manager path is unnecessary: the manager still manages deptId.
        mockMvc.perform(delete("/skills/" + skillId + "/departments/current")
                .header(HttpHeaders.AUTHORIZATION, bearer(manager.token())))
            .andExpect(status().isNoContent());
        assertThat(linkRepository.findBySkillIdWithDepartment(skillId)).isEmpty();
        assertThat(skillRepository.findById(skillId)).isPresent();
    }

    private boolean hasEmployeeSkill(UUID userId, UUID skillId) {
        return employeeSkillRepository.findAll().stream().anyMatch(es ->
            es.getUser().getId().equals(userId) && es.getSkill().getId().equals(skillId));
    }
}
