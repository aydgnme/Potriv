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

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.organization.entity.Department;
import me.aydgn.potriv.organization.entity.DepartmentMembership;
import me.aydgn.potriv.organization.entity.Organization;
import me.aydgn.potriv.organization.repository.DepartmentMembershipRepository;
import me.aydgn.potriv.organization.repository.DepartmentRepository;
import me.aydgn.potriv.organization.repository.OrganizationRepository;
import me.aydgn.potriv.security.entity.SecurityAuditEventType;
import me.aydgn.potriv.security.repository.SecurityAuditEventRepository;

/**
 * Department admin forms: create, edit, and dependency-safe delete. Verifies
 * persistence, validation, CSRF, redirect-after-POST, the delete confirmation,
 * dependency-blocked deletion, and audit trail.
 */
class AdminDepartmentFormIntegrationTest extends AbstractAdminIntegrationTest {

    @Autowired
    private OrganizationRepository organizationRepository;
    @Autowired
    private DepartmentRepository departmentRepository;
    @Autowired
    private DepartmentMembershipRepository membershipRepository;
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private SecurityAuditEventRepository auditEventRepository;

    private record Seed(UUID organizationId, UUID adminUserId) {
    }

    private Seed seed() throws Exception {
        JsonNode admin = registerAdmin(uniqueName("DeptForm"), uniqueEmail("deptform"), "Password123!");
        return new Seed(
            UUID.fromString(admin.get("organizationId").asText()),
            UUID.fromString(admin.get("userId").asText()));
    }

    private Department newDepartment(UUID organizationId, String name) {
        Organization org = organizationRepository.findById(organizationId).orElseThrow();
        return departmentRepository.save(
            new Department(org, name, name.toLowerCase(Locale.ROOT)));
    }

    private boolean audited(SecurityAuditEventType type) {
        return auditEventRepository.findAll().stream()
            .anyMatch(event -> event.getEventType() == type);
    }

    // ----------------------------------------------------------------- Create

    @Test
    void anonymousCreateFormRedirectsToLogin() throws Exception {
        mockMvc.perform(get("/admin/departments/new"))
            .andExpect(status().is3xxRedirection());
    }

    @Test
    void systemAdminCanOpenCreateForm() throws Exception {
        seed();
        String html = adminGet("/admin/departments/new")
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(html).contains("New department", "Organization", "Create department");
    }

    @Test
    void validCreatePersistsAndRedirects() throws Exception {
        Seed seed = seed();
        String name = uniqueName("Engineering");

        mockMvc.perform(post("/admin/departments")
                .param("organizationId", seed.organizationId().toString())
                .param("name", name)
                .with(csrf()).session(adminSession()))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrlPattern("/admin/departments/*"));

        assertThat(departmentRepository.findByOrganization_IdAndNormalizedName(
            seed.organizationId(), name.toLowerCase(Locale.ROOT))).isPresent();
        assertThat(audited(SecurityAuditEventType.ADMIN_DEPARTMENT_CREATED)).isTrue();
    }

    @Test
    void invalidCreateReRendersWithFieldError() throws Exception {
        Seed seed = seed();
        String html = mockMvc.perform(post("/admin/departments")
                .param("organizationId", seed.organizationId().toString())
                .param("name", "   ")
                .with(csrf()).session(adminSession()))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(html).contains("Name is required.");
    }

    @Test
    void invalidOrganizationIsRejectedSafely() throws Exception {
        seed();
        String html = mockMvc.perform(post("/admin/departments")
                .param("organizationId", "not-a-uuid")
                .param("name", uniqueName("Ghost"))
                .with(csrf()).session(adminSession()))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(html).contains("Please select a valid organization.");
    }

    @Test
    void duplicateNameIsRejected() throws Exception {
        Seed seed = seed();
        String name = uniqueName("Sales");
        newDepartment(seed.organizationId(), name);

        String html = mockMvc.perform(post("/admin/departments")
                .param("organizationId", seed.organizationId().toString())
                .param("name", name)
                .with(csrf()).session(adminSession()))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(html).contains("already exists");
    }

    // ------------------------------------------------------------------- Edit

    @Test
    void systemAdminCanOpenEditForm() throws Exception {
        Seed seed = seed();
        Department dept = newDepartment(seed.organizationId(), uniqueName("Support"));
        String html = adminGet("/admin/departments/" + dept.getId() + "/edit")
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(html).contains("Edit department", dept.getName());
    }

    @Test
    void validEditUpdatesNameAndRedirects() throws Exception {
        Seed seed = seed();
        Department dept = newDepartment(seed.organizationId(), uniqueName("Ops"));
        String newName = uniqueName("Operations");

        mockMvc.perform(post("/admin/departments/" + dept.getId() + "/edit")
                .param("name", newName)
                .with(csrf()).session(adminSession()))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrl("/admin/departments/" + dept.getId()));

        assertThat(departmentRepository.findById(dept.getId()).orElseThrow().getName())
            .isEqualTo(newName);
        assertThat(audited(SecurityAuditEventType.ADMIN_DEPARTMENT_UPDATED)).isTrue();
    }

    @Test
    void invalidEditReRendersWithError() throws Exception {
        Seed seed = seed();
        Department dept = newDepartment(seed.organizationId(), uniqueName("Legal"));
        String html = mockMvc.perform(post("/admin/departments/" + dept.getId() + "/edit")
                .param("name", "")
                .with(csrf()).session(adminSession()))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(html).contains("Name is required.");
    }

    // ----------------------------------------------------------------- Delete

    @Test
    void deleteConfirmationDoesNotMutate() throws Exception {
        Seed seed = seed();
        Department dept = newDepartment(seed.organizationId(), uniqueName("Marketing"));

        adminGet("/admin/departments/" + dept.getId() + "/delete")
            .andExpect(status().isOk());

        assertThat(departmentRepository.findById(dept.getId())).isPresent();
    }

    @Test
    void deleteWithoutCsrfIsForbidden() throws Exception {
        Seed seed = seed();
        Department dept = newDepartment(seed.organizationId(), uniqueName("Finance"));

        mockMvc.perform(post("/admin/departments/" + dept.getId() + "/delete")
                .session(adminSession()))
            .andExpect(status().isForbidden());
        assertThat(departmentRepository.findById(dept.getId())).isPresent();
    }

    @Test
    void safeDeleteRemovesDependencyFreeDepartment() throws Exception {
        Seed seed = seed();
        Department dept = newDepartment(seed.organizationId(), uniqueName("Research"));

        mockMvc.perform(post("/admin/departments/" + dept.getId() + "/delete")
                .with(csrf()).session(adminSession()))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrl("/admin/departments"));

        assertThat(departmentRepository.findById(dept.getId())).isEmpty();
        assertThat(audited(SecurityAuditEventType.ADMIN_DEPARTMENT_DELETED)).isTrue();
    }

    @Test
    void deleteBlockedWhenDepartmentHasMembers() throws Exception {
        Seed seed = seed();
        Department dept = newDepartment(seed.organizationId(), uniqueName("Blocked"));
        User admin = userRepository.findById(seed.adminUserId()).orElseThrow();
        membershipRepository.save(new DepartmentMembership(dept, admin, admin));

        // Confirmation page reports the block.
        String confirm = adminGet("/admin/departments/" + dept.getId() + "/delete")
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(confirm).contains("Cannot delete");

        // POST is blocked; department survives.
        mockMvc.perform(post("/admin/departments/" + dept.getId() + "/delete")
                .with(csrf()).session(adminSession()))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrl("/admin/departments/" + dept.getId()));

        assertThat(departmentRepository.findById(dept.getId())).isPresent();
        assertThat(audited(SecurityAuditEventType.ADMIN_DEPARTMENT_DELETE_BLOCKED)).isTrue();
    }

    @Test
    void plainDetailRendersWithActionLinks() throws Exception {
        Seed seed = seed();
        Department dept = newDepartment(seed.organizationId(), uniqueName("DetailPage"));
        String html = adminGet("/admin/departments/" + dept.getId())
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(html).contains(dept.getName(),
            "/admin/departments/" + dept.getId() + "/edit",
            "/admin/departments/" + dept.getId() + "/delete");
    }

    @Test
    void unknownDepartmentReturns404() throws Exception {
        adminGet("/admin/departments/" + UUID.randomUUID() + "/edit")
            .andExpect(status().isNotFound());
        adminGet("/admin/departments/" + UUID.randomUUID() + "/delete")
            .andExpect(status().isNotFound());
    }
}
