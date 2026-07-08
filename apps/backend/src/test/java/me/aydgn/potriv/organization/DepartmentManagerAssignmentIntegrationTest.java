package me.aydgn.potriv.organization;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;
import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.identity.repository.UserRoleRepository;
import me.aydgn.potriv.organization.entity.Department;
import me.aydgn.potriv.organization.entity.DepartmentManagerAssignment;
import me.aydgn.potriv.organization.entity.Organization;
import me.aydgn.potriv.organization.repository.DepartmentManagerAssignmentRepository;
import me.aydgn.potriv.organization.repository.DepartmentMembershipRepository;
import me.aydgn.potriv.organization.repository.DepartmentRepository;
import me.aydgn.potriv.organization.repository.OrganizationRepository;

class DepartmentManagerAssignmentIntegrationTest extends AbstractMockMvcIntegrationTest {

    @Autowired
    private DepartmentManagerAssignmentRepository assignmentRepository;

    @Autowired
    private DepartmentMembershipRepository membershipRepository;

    @Autowired
    private DepartmentRepository departmentRepository;

    @Autowired
    private OrganizationRepository organizationRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private UserRoleRepository userRoleRepository;

    @Test
    void orgAdminAssignsEligibleManagerAndResponseExposesSafeSummary() throws Exception {
        Org org = newOrg();
        UUID deptId = createDepartment(org.adminToken(), "Engineering");
        Employee manager = newDepartmentManager(org, "manager");

        String response = assignManager(org.adminToken(), deptId, manager.userId())
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.manager.userId").value(manager.userId().toString()))
            .andExpect(jsonPath("$.manager.name").exists())
            .andExpect(jsonPath("$.manager.email").value(manager.email()))
            .andReturn().getResponse().getContentAsString();

        JsonNode managerNode = objectMapper.readTree(response).get("manager");
        // No security internals leak through the manager summary.
        assertThat(managerNode.has("passwordHash")).isFalse();
        assertThat(managerNode.has("failedLoginAttempts")).isFalse();
        assertThat(managerNode.has("lockedUntil")).isFalse();
        assertThat(managerNode.has("status")).isFalse();

        // Assignment entity ID is a UUID.
        assertThat(assignmentRepository.findByDepartment_Id(deptId))
            .isPresent()
            .get()
            .extracting(a -> a.getId())
            .isInstanceOf(UUID.class);
    }

    @Test
    void sameManagerSameDepartmentPutIsIdempotent() throws Exception {
        Org org = newOrg();
        UUID deptId = createDepartment(org.adminToken(), "Engineering");
        Employee manager = newDepartmentManager(org, "manager");

        assignManager(org.adminToken(), deptId, manager.userId()).andExpect(status().isOk());
        assignManager(org.adminToken(), deptId, manager.userId()).andExpect(status().isOk());

        assertThat(assignmentRepository.findByManager_Id(manager.userId())).isPresent();
    }

    @Test
    void userWithoutDepartmentManagerRoleIsRejected() throws Exception {
        Org org = newOrg();
        UUID deptId = createDepartment(org.adminToken(), "Engineering");
        Employee plain = newEmployee(org, "plain");

        assignManager(org.adminToken(), deptId, plain.userId())
            .andExpect(status().isBadRequest());
    }

    @Test
    void otherOrgUserReturns404() throws Exception {
        Org orgA = newOrg();
        UUID deptId = createDepartment(orgA.adminToken(), "Engineering");

        Org orgB = newOrg();
        Employee foreignManager = newDepartmentManager(orgB, "foreign");

        assignManager(orgA.adminToken(), deptId, foreignManager.userId())
            .andExpect(status().isNotFound());
    }

    @Test
    void platformSystemAdminCannotBeAssigned() throws Exception {
        Org org = newOrg();
        UUID deptId = createDepartment(org.adminToken(), "Engineering");

        UUID systemAdminId = userRepository.findByEmail(SYSTEM_ADMIN_EMAIL).orElseThrow().getId();

        // Platform user has no organization and is not part of this tenant.
        assignManager(org.adminToken(), deptId, systemAdminId)
            .andExpect(status().isNotFound());
    }

    @Test
    void oneUserCannotManageTwoDepartments() throws Exception {
        Org org = newOrg();
        UUID deptA = createDepartment(org.adminToken(), "Engineering");
        UUID deptB = createDepartment(org.adminToken(), "Design");
        Employee manager = newDepartmentManager(org, "manager");

        assignManager(org.adminToken(), deptA, manager.userId()).andExpect(status().isOk());
        assignManager(org.adminToken(), deptB, manager.userId()).andExpect(status().isConflict());
    }

    @Test
    void databaseUniqueManagerUserIdIsEnforced() throws Exception {
        Org org = newOrg();
        Organization organization = organizationRepository.findById(org.orgId()).orElseThrow();
        Department deptA = departmentRepository.saveAndFlush(
            new Department(organization, "Eng", "eng-" + UUID.randomUUID()));
        Department deptB = departmentRepository.saveAndFlush(
            new Department(organization, "Design", "design-" + UUID.randomUUID()));
        User manager = userRepository.findById(newDepartmentManager(org, "manager").userId())
            .orElseThrow();
        User admin = userRepository.findById(org.adminId()).orElseThrow();

        assignmentRepository.saveAndFlush(
            new DepartmentManagerAssignment(deptA, manager, admin));

        assertThatThrownBy(() -> assignmentRepository.saveAndFlush(
            new DepartmentManagerAssignment(deptB, manager, admin)))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void databaseUniqueDepartmentIdIsEnforced() throws Exception {
        Org org = newOrg();
        Organization organization = organizationRepository.findById(org.orgId()).orElseThrow();
        Department dept = departmentRepository.saveAndFlush(
            new Department(organization, "Eng", "eng-" + UUID.randomUUID()));
        User managerA = userRepository.findById(newDepartmentManager(org, "a").userId()).orElseThrow();
        User managerB = userRepository.findById(newDepartmentManager(org, "b").userId()).orElseThrow();
        User admin = userRepository.findById(org.adminId()).orElseThrow();

        assignmentRepository.saveAndFlush(
            new DepartmentManagerAssignment(dept, managerA, admin));

        assertThatThrownBy(() -> assignmentRepository.saveAndFlush(
            new DepartmentManagerAssignment(dept, managerB, admin)))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void replacingManagerKeepsPreviousAccessRoleAndCreatesNoMembership() throws Exception {
        Org org = newOrg();
        UUID deptId = createDepartment(org.adminToken(), "Engineering");
        Employee managerA = newDepartmentManager(org, "a");
        Employee managerB = newDepartmentManager(org, "b");

        assignManager(org.adminToken(), deptId, managerA.userId()).andExpect(status().isOk());
        assignManager(org.adminToken(), deptId, managerB.userId())
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.manager.userId").value(managerB.userId().toString()));

        // Previous manager keeps the DEPARTMENT_MANAGER access role.
        User userA = userRepository.findById(managerA.userId()).orElseThrow();
        assertThat(userRoleRepository.existsByUserAndRole(userA, AccessRole.DEPARTMENT_MANAGER))
            .isTrue();
        // The new manager is not automatically a member.
        assertThat(membershipRepository.findByMember_Id(managerB.userId())).isEmpty();
    }

    @Test
    void deleteUnassignsIdempotentlyAndKeepsAccessRoleWithoutCreatingMembership() throws Exception {
        Org org = newOrg();
        UUID deptId = createDepartment(org.adminToken(), "Engineering");
        Employee manager = newDepartmentManager(org, "manager");

        assignManager(org.adminToken(), deptId, manager.userId()).andExpect(status().isOk());
        // Assigning a manager never creates a membership.
        assertThat(membershipRepository.findByMember_Id(manager.userId())).isEmpty();

        unassignManager(org.adminToken(), deptId).andExpect(status().isNoContent());
        unassignManager(org.adminToken(), deptId).andExpect(status().isNoContent());

        assertThat(assignmentRepository.findByDepartment_Id(deptId)).isEmpty();
        User user = userRepository.findById(manager.userId()).orElseThrow();
        assertThat(userRoleRepository.existsByUserAndRole(user, AccessRole.DEPARTMENT_MANAGER))
            .isTrue();
    }

    @Test
    void otherOrgAdminCannotManageDepartmentAndEmployeeIsForbidden() throws Exception {
        Org orgA = newOrg();
        UUID deptId = createDepartment(orgA.adminToken(), "Engineering");
        Employee manager = newDepartmentManager(orgA, "manager");

        Org orgB = newOrg();
        assignManager(orgB.adminToken(), deptId, manager.userId())
            .andExpect(status().isNotFound());

        Employee employee = newEmployee(orgA, "emp");
        assignManager(loginForAccessToken(employee.email(), "Password123!"), deptId, manager.userId())
            .andExpect(status().isForbidden());
    }

    @Test
    void departmentWithManagerCannotBeDeletedButCanAfterUnassignment() throws Exception {
        Org org = newOrg();
        UUID deptId = createDepartment(org.adminToken(), "Engineering");
        Employee manager = newDepartmentManager(org, "manager");
        assignManager(org.adminToken(), deptId, manager.userId()).andExpect(status().isOk());

        mockMvc.perform(delete("/departments/" + deptId)
                .header(HttpHeaders.AUTHORIZATION, bearer(org.adminToken())))
            .andExpect(status().isConflict());

        unassignManager(org.adminToken(), deptId).andExpect(status().isNoContent());

        mockMvc.perform(delete("/departments/" + deptId)
                .header(HttpHeaders.AUTHORIZATION, bearer(org.adminToken())))
            .andExpect(status().isNoContent());
    }

    @Test
    void concurrentAssignmentOfSameManagerLeavesExactlyOneAssignment() throws Exception {
        Org org = newOrg();
        UUID deptA = createDepartment(org.adminToken(), "Engineering");
        UUID deptB = createDepartment(org.adminToken(), "Design");
        Employee manager = newDepartmentManager(org, "manager");

        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch startGate = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(2);

        Runnable assignA = concurrentAssign(org.adminToken(), deptA, manager.userId(), startGate, done);
        Runnable assignB = concurrentAssign(org.adminToken(), deptB, manager.userId(), startGate, done);
        executor.submit(assignA);
        executor.submit(assignB);

        startGate.countDown();
        assertThat(done.await(30, TimeUnit.SECONDS)).isTrue();
        executor.shutdown();

        // The unique manager_user_id constraint guarantees a single assignment.
        assertThat(assignmentRepository.findByManager_Id(manager.userId())).isPresent();
        long managedByManager = assignmentRepository.findAll().stream()
            .filter(a -> a.getManager().getId().equals(manager.userId()))
            .count();
        assertThat(managedByManager).isEqualTo(1);
    }

    private Runnable concurrentAssign(
        String token, UUID deptId, UUID userId, CountDownLatch startGate, CountDownLatch done) {
        return () -> {
            try {
                startGate.await();
                assignManager(token, deptId, userId);
            } catch (Exception ignored) {
                // Losing the race is expected for one thread.
            } finally {
                done.countDown();
            }
        };
    }

    // ---- helpers ----

    private record Org(UUID orgId, UUID adminId, String adminToken, String inviteToken) {
    }

    private record Employee(UUID userId, String email) {
    }

    private Org newOrg() throws Exception {
        String email = uniqueEmail("admin");
        JsonNode admin = registerAdmin(uniqueName("Org"), email, "Password123!");
        return new Org(
            UUID.fromString(admin.get("organizationId").asText()),
            UUID.fromString(admin.get("userId").asText()),
            loginForAccessToken(email, "Password123!"),
            extractInviteToken(admin.get("employeeInviteUrl").asText()));
    }

    private Employee newEmployee(Org org, String prefix) throws Exception {
        String email = uniqueEmail(prefix);
        JsonNode employee = registerEmployee(org.inviteToken(), email, "Password123!");
        return new Employee(UUID.fromString(employee.get("userId").asText()), email);
    }

    private Employee newDepartmentManager(Org org, String prefix) throws Exception {
        Employee employee = newEmployee(org, prefix);
        mockMvc.perform(patch("/users/" + employee.userId() + "/roles")
                .header(HttpHeaders.AUTHORIZATION, bearer(org.adminToken()))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    Map.of("roles", List.of("EMPLOYEE", "DEPARTMENT_MANAGER")))))
            .andExpect(status().isOk());
        return employee;
    }

    private UUID createDepartment(String token, String name) throws Exception {
        String body = mockMvc.perform(post("/departments")
                .header(HttpHeaders.AUTHORIZATION, bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("name", name))))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        return UUID.fromString(objectMapper.readTree(body).get("departmentId").asText());
    }

    private ResultActions assignManager(String token, UUID deptId, UUID userId) throws Exception {
        return mockMvc.perform(put("/departments/" + deptId + "/manager")
            .header(HttpHeaders.AUTHORIZATION, bearer(token))
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(Map.of("userId", userId.toString()))));
    }

    private ResultActions unassignManager(String token, UUID deptId) throws Exception {
        return mockMvc.perform(delete("/departments/" + deptId + "/manager")
            .header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }
}
