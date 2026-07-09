package me.aydgn.potriv.skill;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.ResultActions;

import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.organization.entity.Department;
import me.aydgn.potriv.organization.entity.Organization;
import me.aydgn.potriv.organization.repository.DepartmentRepository;
import me.aydgn.potriv.skill.entity.Skill;
import me.aydgn.potriv.skill.entity.SkillCategory;
import me.aydgn.potriv.skill.entity.SkillDepartmentLink;
import me.aydgn.potriv.skill.repository.EmployeeSkillRepository;
import me.aydgn.potriv.skill.repository.SkillCategoryRepository;
import me.aydgn.potriv.skill.repository.SkillDepartmentLinkRepository;
import me.aydgn.potriv.skill.repository.SkillRepository;

class SkillDepartmentLinkIntegrationTest extends AbstractSkillIntegrationTest {

    @Autowired
    private SkillDepartmentLinkRepository linkRepository;

    @Autowired
    private EmployeeSkillRepository employeeSkillRepository;

    @Autowired
    private SkillRepository skillRepository;

    @Autowired
    private SkillCategoryRepository skillCategoryRepository;

    @Autowired
    private DepartmentRepository departmentRepository;

    @Autowired
    private UserRepository userRepository;

    @Test
    void skillStartsEmptyAndManagerLinksOwnDepartmentIdempotentlyWithoutCreatingEmployeeSkill()
        throws Exception {
        Org org = newOrg();
        Manager manager = newDepartmentManager(org, "mgr");
        UUID deptId = createDepartment(org.adminToken(), "Engineering");
        assignManager(org.adminToken(), deptId, manager.userId());
        UUID skillId = createSkillId(
            manager.token(), createCategoryId(manager.token(), "Programming Language"),
            "Java", null);

        listLinks(manager.token(), skillId).andExpect(status().isOk())
            .andExpect(jsonPath("$").isEmpty());

        linkCurrent(manager.token(), skillId).andExpect(status().isOk())
            .andExpect(jsonPath("$[0].departmentId").value(deptId.toString()))
            .andExpect(jsonPath("$[0].name").value("Engineering"));

        SkillDepartmentLink link =
            linkRepository.findBySkill_IdAndDepartment_Id(skillId, deptId).orElseThrow();
        assertThat(link.getId()).isInstanceOf(UUID.class);
        assertThat(link.getLinkedBy().getId()).isEqualTo(manager.userId());

        // Idempotent link and SkillResponse now includes the department.
        linkCurrent(manager.token(), skillId).andExpect(status().isOk());
        assertThat(linkRepository.findBySkillIdWithDepartment(skillId)).hasSize(1);
        mockMvc.perform(get("/skills/" + skillId)
                .header(HttpHeaders.AUTHORIZATION, bearer(manager.token())))
            .andExpect(jsonPath("$.departments[0].departmentId").value(deptId.toString()));

        // Linking never creates an EmployeeSkill.
        assertThat(employeeSkillRepository.findAll().stream()
            .noneMatch(es -> es.getSkill().getId().equals(skillId))).isTrue();
    }

    @Test
    void managerLinksAnotherManagersSkillWithoutAuthorOwnership() throws Exception {
        Org org = newOrg();
        Manager author = newDepartmentManager(org, "author");
        UUID skillId = createSkillId(
            author.token(), createCategoryId(author.token(), "Programming Language"),
            "Java", null);

        Manager linker = newDepartmentManager(org, "linker");
        UUID linkerDept = createDepartment(org.adminToken(), "Design");
        assignManager(org.adminToken(), linkerDept, linker.userId());

        linkCurrent(linker.token(), skillId).andExpect(status().isOk())
            .andExpect(jsonPath("$[0].departmentId").value(linkerDept.toString()));
    }

    @Test
    void roleHolderWithoutAssignmentCannotLink() throws Exception {
        Org org = newOrg();
        Manager author = newDepartmentManager(org, "author");
        UUID skillId = createSkillId(
            author.token(), createCategoryId(author.token(), "Programming Language"),
            "Java", null);

        Manager unassigned = newDepartmentManager(org, "unassigned");
        linkCurrent(unassigned.token(), skillId).andExpect(status().isForbidden());
    }

    @Test
    void crossOrgSkillReturns404ForAssignedForeignManager() throws Exception {
        Org orgA = newOrg();
        Manager managerA = newDepartmentManager(orgA, "a");
        UUID skillId = createSkillId(
            managerA.token(), createCategoryId(managerA.token(), "Programming Language"),
            "Java", null);

        Org orgB = newOrg();
        Manager managerB = newDepartmentManager(orgB, "b");
        UUID deptB = createDepartment(orgB.adminToken(), "Engineering");
        assignManager(orgB.adminToken(), deptB, managerB.userId());

        // Assigned foreign manager: the cross-org skill is not found (anti-leak).
        linkCurrent(managerB.token(), skillId).andExpect(status().isNotFound());
    }

    @Test
    void inactiveSkillKeepsExistingLinkRejectsNewLinkButAllowsUnlink() throws Exception {
        Org org = newOrg();
        Manager manager = newDepartmentManager(org, "mgr");
        UUID deptId = createDepartment(org.adminToken(), "Engineering");
        assignManager(org.adminToken(), deptId, manager.userId());
        UUID skillId = createSkillId(
            manager.token(), createCategoryId(manager.token(), "Programming Language"),
            "Java", null);
        linkCurrent(manager.token(), skillId).andExpect(status().isOk());

        // Deactivate the skill: the existing link survives.
        mockMvc.perform(delete("/skills/" + skillId)
                .header(HttpHeaders.AUTHORIZATION, bearer(manager.token())))
            .andExpect(status().isNoContent());
        assertThat(linkRepository.findBySkillIdWithDepartment(skillId)).hasSize(1);

        // An inactive skill can still be unlinked, but not re-linked.
        unlinkCurrent(manager.token(), skillId).andExpect(status().isNoContent());
        linkCurrent(manager.token(), skillId).andExpect(status().isBadRequest());
    }

    @Test
    void unlinkIsIdempotentAndDoesNotAffectAnotherDepartmentLink() throws Exception {
        Org org = newOrg();
        Manager mgrA = newDepartmentManager(org, "a");
        Manager mgrB = newDepartmentManager(org, "b");
        UUID deptA = createDepartment(org.adminToken(), "Engineering");
        UUID deptB = createDepartment(org.adminToken(), "Design");
        assignManager(org.adminToken(), deptA, mgrA.userId());
        assignManager(org.adminToken(), deptB, mgrB.userId());
        UUID skillId = createSkillId(
            mgrA.token(), createCategoryId(mgrA.token(), "Programming Language"), "Java", null);

        linkCurrent(mgrA.token(), skillId).andExpect(status().isOk());
        linkCurrent(mgrB.token(), skillId).andExpect(status().isOk());
        assertThat(linkRepository.findBySkillIdWithDepartment(skillId)).hasSize(2);

        unlinkCurrent(mgrA.token(), skillId).andExpect(status().isNoContent());
        unlinkCurrent(mgrA.token(), skillId).andExpect(status().isNoContent());
        List<SkillDepartmentLink> remaining = linkRepository.findBySkillIdWithDepartment(skillId);
        assertThat(remaining).hasSize(1);
        assertThat(remaining.get(0).getDepartment().getId()).isEqualTo(deptB);
    }

    @Test
    void departmentWithSkillLinkCannotBeDeletedUntilUnlinked() throws Exception {
        Org org = newOrg();
        Manager manager = newDepartmentManager(org, "mgr");
        UUID deptId = createDepartment(org.adminToken(), "Engineering");
        assignManager(org.adminToken(), deptId, manager.userId());
        UUID skillId = createSkillId(
            manager.token(), createCategoryId(manager.token(), "Programming Language"),
            "Java", null);
        linkCurrent(manager.token(), skillId).andExpect(status().isOk());

        // Remove the manager assignment so only the skill link blocks deletion.
        unassignManager(org.adminToken(), deptId).andExpect(status().isNoContent());
        deleteDepartment(org.adminToken(), deptId).andExpect(status().isConflict());

        // Re-assign, unlink, unassign, then deletion proceeds.
        assignManager(org.adminToken(), deptId, manager.userId());
        unlinkCurrent(manager.token(), skillId).andExpect(status().isNoContent());
        unassignManager(org.adminToken(), deptId).andExpect(status().isNoContent());
        deleteDepartment(org.adminToken(), deptId).andExpect(status().isNoContent());
    }

    @Test
    void databaseUniqueSkillDepartmentIsEnforced() throws Exception {
        Org org = newOrg();
        Organization organization = userRepository.findById(org.adminId())
            .orElseThrow().getOrganization();
        User author = userRepository.findById(org.adminId()).orElseThrow();

        Department department = departmentRepository.saveAndFlush(
            new Department(organization, "Eng " + UUID.randomUUID(), "eng-" + UUID.randomUUID()));
        SkillCategory category = skillCategoryRepository.saveAndFlush(
            new SkillCategory(organization, "Cat " + UUID.randomUUID(), "cat-" + UUID.randomUUID()));
        Skill skill = skillRepository.saveAndFlush(new Skill(
            organization, category, "Java " + UUID.randomUUID(), "java-" + UUID.randomUUID(),
            null, author));

        linkRepository.saveAndFlush(new SkillDepartmentLink(skill, department, author));

        assertThatThrownBy(() -> linkRepository.saveAndFlush(
            new SkillDepartmentLink(skill, department, author)))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    // ---- helpers ----

    private ResultActions listLinks(String token, UUID skillId) throws Exception {
        return mockMvc.perform(get("/skills/" + skillId + "/departments")
            .header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }

    private ResultActions linkCurrent(String token, UUID skillId) throws Exception {
        return mockMvc.perform(post("/skills/" + skillId + "/departments/current")
            .header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }

    private ResultActions unlinkCurrent(String token, UUID skillId) throws Exception {
        return mockMvc.perform(delete("/skills/" + skillId + "/departments/current")
            .header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }

    private ResultActions unassignManager(String adminToken, UUID deptId) throws Exception {
        return mockMvc.perform(delete("/departments/" + deptId + "/manager")
            .header(HttpHeaders.AUTHORIZATION, bearer(adminToken)));
    }

    private ResultActions deleteDepartment(String token, UUID deptId) throws Exception {
        return mockMvc.perform(delete("/departments/" + deptId)
            .header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }
}
