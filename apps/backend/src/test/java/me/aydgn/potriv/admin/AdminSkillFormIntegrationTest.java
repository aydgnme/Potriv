package me.aydgn.potriv.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrlPattern;
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
import me.aydgn.potriv.security.entity.SecurityAuditEventType;
import me.aydgn.potriv.security.repository.SecurityAuditEventRepository;
import me.aydgn.potriv.skill.entity.Skill;
import me.aydgn.potriv.skill.entity.SkillCategory;
import me.aydgn.potriv.skill.repository.SkillCategoryRepository;
import me.aydgn.potriv.skill.repository.SkillDepartmentLinkRepository;
import me.aydgn.potriv.skill.repository.SkillRepository;

/** Skill admin forms: create/edit with scoping, immutability, and safe deactivate. */
class AdminSkillFormIntegrationTest extends AbstractAdminIntegrationTest {

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
    private SecurityAuditEventRepository auditEventRepository;
    @Autowired
    private PasswordEncoder passwordEncoder;

    private UUID org() throws Exception {
        JsonNode admin = registerAdmin(uniqueName("SkillOrg"), uniqueEmail("skillorg"), "Password123!");
        return UUID.fromString(admin.get("organizationId").asText());
    }

    private User manager(UUID organizationId) {
        Organization o = organizationRepository.findById(organizationId).orElseThrow();
        User u = userRepository.save(new User(
            o, uniqueName("Mgr"), uniqueEmail("mgr"), passwordEncoder.encode("Password123!")));
        userRoleRepository.save(new UserRole(u, AccessRole.DEPARTMENT_MANAGER));
        return u;
    }

    private SkillCategory category(UUID organizationId, String name) {
        Organization o = organizationRepository.findById(organizationId).orElseThrow();
        return categoryRepository.save(new SkillCategory(o, name, name.toLowerCase(Locale.ROOT)));
    }

    private Department department(UUID organizationId, String name) {
        Organization o = organizationRepository.findById(organizationId).orElseThrow();
        return departmentRepository.save(new Department(o, name, name.toLowerCase(Locale.ROOT)));
    }

    private Skill skill(UUID organizationId, SkillCategory category, User author, String name) {
        Organization o = organizationRepository.findById(organizationId).orElseThrow();
        return skillRepository.save(new Skill(
            o, category, name, name.toLowerCase(Locale.ROOT), "seed", author));
    }

    private boolean audited(SecurityAuditEventType type) {
        return auditEventRepository.findAll().stream().anyMatch(e -> e.getEventType() == type);
    }

    @Test
    void listAndDetailRender() throws Exception {
        UUID orgId = org();
        SkillCategory cat = category(orgId, uniqueName("Lang"));
        User author = manager(orgId);
        Skill s = skill(orgId, cat, author, uniqueName("Java"));

        adminGet("/admin/skills").andExpect(status().isOk());
        String html = adminGet("/admin/skills/" + s.getId())
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(html).contains(s.getName(), cat.getName(), author.getName(), "Description");
        assertThat(html).doesNotContain("passwordHash", "normalizedName");
    }

    @Test
    void validCreateWithLinksPersistsAndRedirects() throws Exception {
        UUID orgId = org();
        SkillCategory cat = category(orgId, uniqueName("Backend"));
        User author = manager(orgId);
        Department dept = department(orgId, uniqueName("Platform"));
        String name = uniqueName("Spring");

        mockMvc.perform(post("/admin/skills")
                .param("organizationId", orgId.toString())
                .param("categoryId", cat.getId().toString())
                .param("name", name)
                .param("description", "Spring framework skill")
                .param("authorId", author.getId().toString())
                .param("departmentIds", dept.getId().toString())
                .with(csrf()).session(adminSession()))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrlPattern("/admin/skills/*"));

        Skill created = skillRepository.findByOrganization_IdAndCategory_IdAndNormalizedName(
            orgId, cat.getId(), name.toLowerCase(Locale.ROOT)).orElseThrow();
        assertThat(created.getAuthor().getId()).isEqualTo(author.getId());
        assertThat(linkRepository.countBySkill_Id(created.getId())).isEqualTo(1);
        assertThat(audited(SecurityAuditEventType.ADMIN_SKILL_CREATED)).isTrue();
    }

    @Test
    void categoryFromAnotherOrganizationBlocked() throws Exception {
        UUID orgA = org();
        UUID orgB = org();
        SkillCategory catB = category(orgB, uniqueName("Foreign"));
        User authorA = manager(orgA);

        String html = mockMvc.perform(post("/admin/skills")
                .param("organizationId", orgA.toString())
                .param("categoryId", catB.getId().toString())
                .param("name", uniqueName("X"))
                .param("authorId", authorA.getId().toString())
                .with(csrf()).session(adminSession()))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(html).contains("not in this organization");
    }

    @Test
    void authorFromAnotherOrganizationBlocked() throws Exception {
        UUID orgA = org();
        UUID orgB = org();
        SkillCategory catA = category(orgA, uniqueName("Cat"));
        User authorB = manager(orgB);

        String html = mockMvc.perform(post("/admin/skills")
                .param("organizationId", orgA.toString())
                .param("categoryId", catA.getId().toString())
                .param("name", uniqueName("X"))
                .param("authorId", authorB.getId().toString())
                .with(csrf()).session(adminSession()))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(html).contains("must belong to the selected organization");
    }

    @Test
    void nonManagerAuthorBlocked() throws Exception {
        UUID orgId = org();
        SkillCategory cat = category(orgId, uniqueName("Cat"));
        Organization o = organizationRepository.findById(orgId).orElseThrow();
        User employee = userRepository.save(new User(
            o, uniqueName("Emp"), uniqueEmail("emp"), passwordEncoder.encode("Password123!")));
        userRoleRepository.save(new UserRole(employee, AccessRole.EMPLOYEE));

        String html = mockMvc.perform(post("/admin/skills")
                .param("organizationId", orgId.toString())
                .param("categoryId", cat.getId().toString())
                .param("name", uniqueName("X"))
                .param("authorId", employee.getId().toString())
                .with(csrf()).session(adminSession()))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(html).contains("must be a Department Manager");
    }

    @Test
    void departmentFromAnotherOrganizationBlocked() throws Exception {
        UUID orgA = org();
        UUID orgB = org();
        SkillCategory catA = category(orgA, uniqueName("Cat"));
        User authorA = manager(orgA);
        Department deptB = department(orgB, uniqueName("Foreign"));

        String html = mockMvc.perform(post("/admin/skills")
                .param("organizationId", orgA.toString())
                .param("categoryId", catA.getId().toString())
                .param("name", uniqueName("X"))
                .param("authorId", authorA.getId().toString())
                .param("departmentIds", deptB.getId().toString())
                .with(csrf()).session(adminSession()))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(html).contains("not in this organization");
    }

    @Test
    void duplicateNameInSameCategoryBlocked() throws Exception {
        UUID orgId = org();
        SkillCategory cat = category(orgId, uniqueName("Cat"));
        User author = manager(orgId);
        String name = uniqueName("Dup");
        skill(orgId, cat, author, name);

        String html = mockMvc.perform(post("/admin/skills")
                .param("organizationId", orgId.toString())
                .param("categoryId", cat.getId().toString())
                .param("name", name)
                .param("authorId", author.getId().toString())
                .with(csrf()).session(adminSession()))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(html).contains("already exists in this category");
    }

    @Test
    void sameNameInDifferentCategoryAllowed() throws Exception {
        UUID orgId = org();
        SkillCategory catA = category(orgId, uniqueName("CatA"));
        SkillCategory catB = category(orgId, uniqueName("CatB"));
        User author = manager(orgId);
        String name = uniqueName("Shared");
        skill(orgId, catA, author, name);

        mockMvc.perform(post("/admin/skills")
                .param("organizationId", orgId.toString())
                .param("categoryId", catB.getId().toString())
                .param("name", name)
                .param("authorId", author.getId().toString())
                .with(csrf()).session(adminSession()))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrlPattern("/admin/skills/*"));
        assertThat(skillRepository.findByOrganization_IdAndCategory_IdAndNormalizedName(
            orgId, catB.getId(), name.toLowerCase(Locale.ROOT))).isPresent();
    }

    @Test
    void validEditUpdatesFieldsKeepingAuthorAndOrganization() throws Exception {
        UUID orgId = org();
        SkillCategory catA = category(orgId, uniqueName("A"));
        SkillCategory catB = category(orgId, uniqueName("B"));
        User author = manager(orgId);
        Department dept = department(orgId, uniqueName("Dept"));
        Skill s = skill(orgId, catA, author, uniqueName("Old"));
        String newName = uniqueName("New");

        mockMvc.perform(post("/admin/skills/" + s.getId() + "/edit")
                .param("categoryId", catB.getId().toString())
                .param("name", newName)
                .param("description", "updated")
                .param("departmentIds", dept.getId().toString())
                .with(csrf()).session(adminSession()))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrl("/admin/skills/" + s.getId()));

        Skill reloaded = skillRepository.findById(s.getId()).orElseThrow();
        assertThat(reloaded.getName()).isEqualTo(newName);
        assertThat(reloaded.getCategory().getId()).isEqualTo(catB.getId());
        assertThat(reloaded.getDescription()).isEqualTo("updated");
        // Author and organization are immutable.
        assertThat(reloaded.getAuthor().getId()).isEqualTo(author.getId());
        assertThat(reloaded.getOrganization().getId()).isEqualTo(orgId);
        assertThat(linkRepository.countBySkill_Id(s.getId())).isEqualTo(1);
        assertThat(audited(SecurityAuditEventType.ADMIN_SKILL_UPDATED)).isTrue();
    }

    @Test
    void deactivateThenReactivatePreservesLinks() throws Exception {
        UUID orgId = org();
        SkillCategory cat = category(orgId, uniqueName("Cat"));
        User author = manager(orgId);
        Department dept = department(orgId, uniqueName("Dept"));
        Skill s = skill(orgId, cat, author, uniqueName("Toggle"));
        linkRepository.save(new me.aydgn.potriv.skill.entity.SkillDepartmentLink(s, dept, author));

        mockMvc.perform(post("/admin/skills/" + s.getId() + "/deactivate")
                .with(csrf()).session(adminSession()))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrl("/admin/skills/" + s.getId()));
        assertThat(skillRepository.findById(s.getId()).orElseThrow().isActive()).isFalse();
        // Links survive deactivation.
        assertThat(linkRepository.countBySkill_Id(s.getId())).isEqualTo(1);
        assertThat(audited(SecurityAuditEventType.ADMIN_SKILL_DEACTIVATED)).isTrue();

        mockMvc.perform(post("/admin/skills/" + s.getId() + "/reactivate")
                .with(csrf()).session(adminSession()))
            .andExpect(status().is3xxRedirection());
        assertThat(skillRepository.findById(s.getId()).orElseThrow().isActive()).isTrue();
        assertThat(audited(SecurityAuditEventType.ADMIN_SKILL_REACTIVATED)).isTrue();
    }

    @Test
    void deactivateWithoutCsrfIsForbidden() throws Exception {
        UUID orgId = org();
        SkillCategory cat = category(orgId, uniqueName("Cat"));
        User author = manager(orgId);
        Skill s = skill(orgId, cat, author, uniqueName("NoCsrf"));
        mockMvc.perform(post("/admin/skills/" + s.getId() + "/deactivate")
                .session(adminSession()))
            .andExpect(status().isForbidden());
        assertThat(skillRepository.findById(s.getId()).orElseThrow().isActive()).isTrue();
    }

    @Test
    void unknownSkillReturns404() throws Exception {
        adminGet("/admin/skills/" + UUID.randomUUID()).andExpect(status().isNotFound());
        adminGet("/admin/skills/" + UUID.randomUUID() + "/edit").andExpect(status().isNotFound());
    }

    @Test
    void adminSessionDoesNotAuthenticateRestApi() throws Exception {
        mockMvc.perform(get("/projects/managed").session(adminSession()))
            .andExpect(status().isUnauthorized());
    }
}
