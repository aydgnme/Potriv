package me.aydgn.potriv.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.AccessAccountStatus;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.entity.UserRole;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.identity.repository.UserRoleRepository;
import me.aydgn.potriv.organization.entity.Department;
import me.aydgn.potriv.organization.entity.DepartmentManagerAssignment;
import me.aydgn.potriv.organization.entity.DepartmentMembership;
import me.aydgn.potriv.organization.entity.Organization;
import me.aydgn.potriv.organization.repository.DepartmentManagerAssignmentRepository;
import me.aydgn.potriv.organization.repository.DepartmentMembershipRepository;
import me.aydgn.potriv.organization.repository.DepartmentRepository;
import me.aydgn.potriv.organization.repository.OrganizationRepository;
import me.aydgn.potriv.project.entity.Project;
import me.aydgn.potriv.project.entity.ProjectPeriod;
import me.aydgn.potriv.project.entity.ProjectStatus;
import me.aydgn.potriv.project.repository.ProjectRepository;
import me.aydgn.potriv.security.entity.SecurityAuditEventType;
import me.aydgn.potriv.security.repository.SecurityAuditEventRepository;

/** Safe user role management: grant/revoke with SYSTEM_ADMIN block, self-revoke
 *  guard, dependency-based revoke guards, CSRF, and audit. */
class AdminUserRoleManagementIntegrationTest extends AbstractAdminIntegrationTest {

    @Autowired
    private UserRepository userRepository;
    @Autowired
    private UserRoleRepository userRoleRepository;
    @Autowired
    private OrganizationRepository organizationRepository;
    @Autowired
    private DepartmentRepository departmentRepository;
    @Autowired
    private DepartmentManagerAssignmentRepository managerAssignmentRepository;
    @Autowired
    private DepartmentMembershipRepository membershipRepository;
    @Autowired
    private ProjectRepository projectRepository;
    @Autowired
    private SecurityAuditEventRepository auditEventRepository;
    @Autowired
    private PasswordEncoder passwordEncoder;

    private UUID orgId() throws Exception {
        JsonNode admin = registerAdmin(uniqueName("RoleOrg"), uniqueEmail("roleorg"), "Password123!");
        return UUID.fromString(admin.get("organizationId").asText());
    }

    private User activeUser(UUID organizationId) {
        Organization o = organizationRepository.findById(organizationId).orElseThrow();
        return userRepository.save(new User(
            o, uniqueName("U"), uniqueEmail("u"), passwordEncoder.encode("Password123!")));
    }

    private void grantRoleDirect(User user, AccessRole role) {
        userRoleRepository.save(new UserRole(user, role));
    }

    private boolean hasRole(UUID userId, AccessRole role) {
        User u = userRepository.findById(userId).orElseThrow();
        return userRoleRepository.existsByUserAndRole(u, role);
    }

    private long roleCount(User user, AccessRole role) {
        return userRoleRepository.findByUser(user).stream()
            .filter(r -> r.getRole() == role).count();
    }

    private boolean audited(SecurityAuditEventType type) {
        return auditEventRepository.findAll().stream().anyMatch(e -> e.getEventType() == type);
    }

    private boolean auditedDetails(String substring) {
        return auditEventRepository.findAll().stream()
            .anyMatch(e -> e.getDetails() != null && e.getDetails().contains(substring));
    }

    private void grant(UUID userId, String role) throws Exception {
        mockMvc.perform(post("/admin/users/" + userId + "/roles/grant")
                .param("role", role).with(csrf()).session(adminSession()))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrl("/admin/users/" + userId + "/roles"));
    }

    private void revoke(UUID userId, String role) throws Exception {
        mockMvc.perform(post("/admin/users/" + userId + "/roles/revoke")
                .param("role", role).with(csrf()).session(adminSession()))
            .andExpect(status().is3xxRedirection());
    }

    // --------------------------------------------------------------- Read/page

    @Test
    void anonymousRolePageRedirectsToLogin() throws Exception {
        mockMvc.perform(get("/admin/users/" + activeUser(orgId()).getId() + "/roles"))
            .andExpect(status().is3xxRedirection());
    }

    @Test
    void adminOpensRolePageWithoutSecrets() throws Exception {
        String html = adminGet("/admin/users/" + activeUser(orgId()).getId() + "/roles")
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(html).contains("Manage roles", "Manageable roles", "EMPLOYEE");
        assertThat(html).doesNotContain("passwordHash", "refreshToken", "normalizedName");
    }

    @Test
    void unknownUserReturns404() throws Exception {
        adminGet("/admin/users/" + UUID.randomUUID() + "/roles").andExpect(status().isNotFound());
    }

    // ------------------------------------------------------------------- Grant

    @Test
    void grantEmployeeAndOrgAdminPersist() throws Exception {
        User user = activeUser(orgId());
        grant(user.getId(), "EMPLOYEE");
        grant(user.getId(), "ORGANIZATION_ADMIN");
        assertThat(hasRole(user.getId(), AccessRole.EMPLOYEE)).isTrue();
        assertThat(hasRole(user.getId(), AccessRole.ORGANIZATION_ADMIN)).isTrue();
        assertThat(audited(SecurityAuditEventType.ADMIN_USER_ROLE_GRANTED)).isTrue();
    }

    @Test
    void grantDepartmentManagerDoesNotCreateAssignment() throws Exception {
        User user = activeUser(orgId());
        grant(user.getId(), "DEPARTMENT_MANAGER");
        assertThat(hasRole(user.getId(), AccessRole.DEPARTMENT_MANAGER)).isTrue();
        assertThat(managerAssignmentRepository.existsByManager_Id(user.getId())).isFalse();
    }

    @Test
    void grantProjectManagerDoesNotCreateOwnership() throws Exception {
        User user = activeUser(orgId());
        grant(user.getId(), "PROJECT_MANAGER");
        assertThat(hasRole(user.getId(), AccessRole.PROJECT_MANAGER)).isTrue();
        assertThat(projectRepository.existsByProjectManager_IdAndStatusNot(
            user.getId(), ProjectStatus.CLOSED)).isFalse();
    }

    @Test
    void duplicateGrantIsIdempotent() throws Exception {
        User user = activeUser(orgId());
        grant(user.getId(), "EMPLOYEE");
        grant(user.getId(), "EMPLOYEE");
        assertThat(roleCount(user, AccessRole.EMPLOYEE)).isEqualTo(1);
    }

    @Test
    void grantWithoutCsrfIsForbidden() throws Exception {
        User user = activeUser(orgId());
        mockMvc.perform(post("/admin/users/" + user.getId() + "/roles/grant")
                .param("role", "EMPLOYEE").session(adminSession()))
            .andExpect(status().isForbidden());
        assertThat(hasRole(user.getId(), AccessRole.EMPLOYEE)).isFalse();
    }

    @Test
    void tamperedSystemAdminGrantIsBlocked() throws Exception {
        User user = activeUser(orgId());
        grant(user.getId(), "SYSTEM_ADMIN");
        assertThat(hasRole(user.getId(), AccessRole.SYSTEM_ADMIN)).isFalse();
        assertThat(audited(SecurityAuditEventType.ADMIN_USER_ROLE_ACTION_BLOCKED)).isTrue();
    }

    @Test
    void suspendedUserRoleMutationIsBlocked() throws Exception {
        User user = activeUser(orgId());
        user.changeStatus(AccessAccountStatus.SUSPENDED);
        userRepository.save(user);
        grant(user.getId(), "EMPLOYEE");
        assertThat(hasRole(user.getId(), AccessRole.EMPLOYEE)).isFalse();
        assertThat(auditedDetails("Only active users")).isTrue();
    }

    // ------------------------------------------------------------------ Revoke

    @Test
    void revokeOrgAdminPersists() throws Exception {
        User user = activeUser(orgId());
        grantRoleDirect(user, AccessRole.ORGANIZATION_ADMIN);
        revoke(user.getId(), "ORGANIZATION_ADMIN");
        assertThat(hasRole(user.getId(), AccessRole.ORGANIZATION_ADMIN)).isFalse();
        assertThat(audited(SecurityAuditEventType.ADMIN_USER_ROLE_REVOKED)).isTrue();
    }

    @Test
    void missingRoleRevokeIsIdempotent() throws Exception {
        User user = activeUser(orgId());
        revoke(user.getId(), "EMPLOYEE");
        assertThat(hasRole(user.getId(), AccessRole.EMPLOYEE)).isFalse();
    }

    @Test
    void revokeWithoutCsrfIsForbidden() throws Exception {
        User user = activeUser(orgId());
        grantRoleDirect(user, AccessRole.ORGANIZATION_ADMIN);
        mockMvc.perform(post("/admin/users/" + user.getId() + "/roles/revoke")
                .param("role", "ORGANIZATION_ADMIN").session(adminSession()))
            .andExpect(status().isForbidden());
        assertThat(hasRole(user.getId(), AccessRole.ORGANIZATION_ADMIN)).isTrue();
    }

    @Test
    void tamperedSystemAdminRevokeIsBlocked() throws Exception {
        User user = activeUser(orgId());
        grantRoleDirect(user, AccessRole.SYSTEM_ADMIN);
        // Keep this user out of the active-SYSTEM_ADMIN count so it cannot pollute
        // the last-admin guard in other classes (SYSTEM_ADMIN revoke is rejected
        // at parsing regardless of account status).
        user.changeStatus(AccessAccountStatus.SUSPENDED);
        userRepository.save(user);
        revoke(user.getId(), "SYSTEM_ADMIN");
        assertThat(hasRole(user.getId(), AccessRole.SYSTEM_ADMIN)).isTrue();
    }

    @Test
    void signedInAdminCannotRevokeOwnRole() throws Exception {
        UUID selfId = userRepository.findByEmail(SYSTEM_ADMIN_EMAIL).orElseThrow().getId();
        revoke(selfId, "ORGANIZATION_ADMIN");
        assertThat(auditedDetails("own roles")).isTrue();
    }

    @Test
    void revokeDepartmentManagerBlockedWhenManaging() throws Exception {
        UUID org = orgId();
        User user = activeUser(org);
        grantRoleDirect(user, AccessRole.DEPARTMENT_MANAGER);
        Organization o = organizationRepository.findById(org).orElseThrow();
        Department dept = departmentRepository.save(
            new Department(o, uniqueName("Dept"), uniqueName("dept").toLowerCase()));
        managerAssignmentRepository.save(new DepartmentManagerAssignment(dept, user, user));

        revoke(user.getId(), "DEPARTMENT_MANAGER");
        assertThat(hasRole(user.getId(), AccessRole.DEPARTMENT_MANAGER)).isTrue();
        assertThat(auditedDetails("manages a department")).isTrue();
    }

    @Test
    void revokeProjectManagerBlockedWhenOwningActiveProject() throws Exception {
        UUID org = orgId();
        User user = activeUser(org);
        grantRoleDirect(user, AccessRole.PROJECT_MANAGER);
        Organization o = organizationRepository.findById(org).orElseThrow();
        projectRepository.save(new Project(o, user, uniqueName("Proj"), ProjectPeriod.FIXED,
            LocalDate.of(2026, 8, 1), LocalDate.of(2026, 12, 31),
            ProjectStatus.IN_PROGRESS, "active project"));

        revoke(user.getId(), "PROJECT_MANAGER");
        assertThat(hasRole(user.getId(), AccessRole.PROJECT_MANAGER)).isTrue();
        assertThat(auditedDetails("non-closed projects")).isTrue();
    }

    @Test
    void revokeEmployeeBlockedWhenHasDependencies() throws Exception {
        UUID org = orgId();
        User user = activeUser(org);
        grantRoleDirect(user, AccessRole.EMPLOYEE);
        Organization o = organizationRepository.findById(org).orElseThrow();
        Department dept = departmentRepository.save(
            new Department(o, uniqueName("Dept"), uniqueName("dept").toLowerCase()));
        membershipRepository.save(new DepartmentMembership(dept, user, user));

        revoke(user.getId(), "EMPLOYEE");
        assertThat(hasRole(user.getId(), AccessRole.EMPLOYEE)).isTrue();
        assertThat(auditedDetails("employee profile")).isTrue();
    }

    @Test
    void adminSessionDoesNotAuthenticateRestApi() throws Exception {
        mockMvc.perform(get("/projects/managed").session(adminSession()))
            .andExpect(status().isUnauthorized());
    }
}
