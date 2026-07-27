package me.aydgn.potriv.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Locale;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.entity.UserRole;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.identity.repository.UserRoleRepository;
import me.aydgn.potriv.organization.entity.Department;
import me.aydgn.potriv.organization.entity.Organization;
import me.aydgn.potriv.organization.repository.DepartmentRepository;
import me.aydgn.potriv.organization.repository.OrganizationRepository;
import me.aydgn.potriv.skill.entity.Skill;
import me.aydgn.potriv.skill.entity.SkillCategory;
import me.aydgn.potriv.skill.repository.SkillCategoryRepository;
import me.aydgn.potriv.skill.repository.SkillDepartmentLinkRepository;
import me.aydgn.potriv.skill.repository.SkillRepository;

/** Skill department-link management: safe add/remove with same-org scoping. */
class AdminSkillDepartmentLinkIntegrationTest extends AbstractAdminIntegrationTest {

    @Autowired
    private OrganizationRepository organizationRepository;
    @Autowired
    private SkillCategoryRepository categoryRepository;
    @Autowired
    private SkillRepository skillRepository;
    @Autowired
    private SkillDepartmentLinkRepository linkRepository;
    @Autowired
    private DepartmentRepository departmentRepository;
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private UserRoleRepository userRoleRepository;
    @Autowired
    private PasswordEncoder passwordEncoder;

    private UUID orgId;
    private Skill skill;

    private UUID org() throws Exception {
        JsonNode admin = registerAdmin(uniqueName("LinkOrg"), uniqueEmail("linkorg"), "Password123!");
        return UUID.fromString(admin.get("organizationId").asText());
    }

    private Skill seedSkill(UUID organizationId) {
        Organization o = organizationRepository.findById(organizationId).orElseThrow();
        User author = userRepository.save(new User(
            o, uniqueName("Mgr"), uniqueEmail("mgr"), passwordEncoder.encode("Password123!")));
        userRoleRepository.save(new UserRole(author, AccessRole.DEPARTMENT_MANAGER));
        SkillCategory cat = categoryRepository.save(
            new SkillCategory(o, uniqueName("Cat"), uniqueName("cat").toLowerCase(Locale.ROOT)));
        String name = uniqueName("Skill");
        return skillRepository.save(new Skill(o, cat, name, name.toLowerCase(Locale.ROOT), null, author));
    }

    private Department department(UUID organizationId, String name) {
        Organization o = organizationRepository.findById(organizationId).orElseThrow();
        return departmentRepository.save(new Department(o, name, name.toLowerCase(Locale.ROOT)));
    }

    @Test
    void addLinkPersistsAndRedirects() throws Exception {
        orgId = org();
        skill = seedSkill(orgId);
        Department dept = department(orgId, uniqueName("Dept"));

        mockMvc.perform(post("/admin/skills/" + skill.getId() + "/department-links")
                .param("departmentId", dept.getId().toString())
                .with(csrf()).session(adminSession()))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrl("/admin/skills/" + skill.getId() + "/department-links"));
        assertThat(linkRepository.existsBySkill_IdAndDepartment_Id(skill.getId(), dept.getId()))
            .isTrue();
    }

    @Test
    void duplicateLinkIsControlled() throws Exception {
        orgId = org();
        skill = seedSkill(orgId);
        Department dept = department(orgId, uniqueName("Dept"));

        for (int i = 0; i < 2; i++) {
            mockMvc.perform(post("/admin/skills/" + skill.getId() + "/department-links")
                    .param("departmentId", dept.getId().toString())
                    .with(csrf()).session(adminSession()))
                .andExpect(status().is3xxRedirection());
        }
        assertThat(linkRepository.countBySkill_Id(skill.getId())).isEqualTo(1);
    }

    @Test
    void removeLinkKeepsSkillAndDepartment() throws Exception {
        orgId = org();
        skill = seedSkill(orgId);
        Department dept = department(orgId, uniqueName("Dept"));
        linkRepository.save(new me.aydgn.potriv.skill.entity.SkillDepartmentLink(
            skill, dept, skill.getAuthor()));

        mockMvc.perform(post("/admin/skills/" + skill.getId()
                + "/department-links/" + dept.getId() + "/remove")
                .with(csrf()).session(adminSession()))
            .andExpect(status().is3xxRedirection());
        assertThat(linkRepository.existsBySkill_IdAndDepartment_Id(skill.getId(), dept.getId()))
            .isFalse();
        // Neither the skill nor the department is deleted.
        assertThat(skillRepository.findById(skill.getId())).isPresent();
        assertThat(departmentRepository.findById(dept.getId())).isPresent();
    }

    @Test
    void crossOrganizationDepartmentBlocked() throws Exception {
        orgId = org();
        skill = seedSkill(orgId);
        UUID otherOrg = org();
        Department foreign = department(otherOrg, uniqueName("Foreign"));

        mockMvc.perform(post("/admin/skills/" + skill.getId() + "/department-links")
                .param("departmentId", foreign.getId().toString())
                .with(csrf()).session(adminSession()))
            .andExpect(status().is3xxRedirection());
        assertThat(linkRepository.existsBySkill_IdAndDepartment_Id(skill.getId(), foreign.getId()))
            .isFalse();
    }

    @Test
    void addLinkWithoutCsrfIsForbidden() throws Exception {
        orgId = org();
        skill = seedSkill(orgId);
        Department dept = department(orgId, uniqueName("Dept"));
        mockMvc.perform(post("/admin/skills/" + skill.getId() + "/department-links")
                .param("departmentId", dept.getId().toString())
                .session(adminSession()))
            .andExpect(status().isForbidden());
    }

    @Test
    void managePageRenders() throws Exception {
        orgId = org();
        skill = seedSkill(orgId);
        adminGet("/admin/skills/" + skill.getId() + "/department-links")
            .andExpect(status().isOk());
    }
}
