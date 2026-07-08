package me.aydgn.potriv.organization;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;

import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.entity.UserRole;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.identity.repository.UserRoleRepository;
import me.aydgn.potriv.organization.entity.Department;
import me.aydgn.potriv.organization.entity.DepartmentMembership;
import me.aydgn.potriv.organization.entity.Organization;
import me.aydgn.potriv.organization.repository.DepartmentManagerAssignmentRepository;
import me.aydgn.potriv.organization.repository.DepartmentMembershipRepository;
import me.aydgn.potriv.organization.repository.DepartmentRepository;
import me.aydgn.potriv.organization.repository.OrganizationRepository;

class DepartmentMembershipIntegrationTest extends AbstractOrganizationStructureIntegrationTest {

    @Autowired
    private DepartmentMembershipRepository membershipRepository;

    @Autowired
    private DepartmentManagerAssignmentRepository assignmentRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private UserRoleRepository userRoleRepository;

    @Autowired
    private OrganizationRepository organizationRepository;

    @Autowired
    private DepartmentRepository departmentRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Test
    void newlyRegisteredEmployeeHasNoMembership() throws Exception {
        Org org = newOrg();
        Employee employee = newEmployee(org, "emp");

        assertThat(membershipRepository.findByMember_Id(employee.userId())).isEmpty();
    }

    @Test
    void unassignedListIsTenantScopedEmployeeOnlyExcludingPlatformAndForeign() throws Exception {
        Org org = newOrg();
        UUID dept = createDepartment(org.adminToken(), "Engineering");
        Manager manager = newDepartmentManager(org, "manager");
        assignManager(org.adminToken(), dept, manager.userId()).andExpect(status().isOk());
        Employee employee = newEmployee(org, "emp");

        // A same-org user WITHOUT the EMPLOYEE role must not be a candidate.
        Organization organization = organizationRepository.findById(org.orgId()).orElseThrow();
        User nonEmployee = userRepository.save(new User(
            organization, "Non Employee", uniqueEmail("nonemp"),
            passwordEncoder.encode("Password123!")));
        userRoleRepository.save(new UserRole(nonEmployee, AccessRole.PROJECT_MANAGER));

        // A different organization with its own employee.
        Org foreign = newOrg();
        Employee foreignEmployee = newEmployee(foreign, "foreign");

        var emails = emailsOf(listUnassigned(manager.token()));

        assertThat(emails).contains(employee.email());
        assertThat(emails).doesNotContain(
            foreignEmployee.email(),
            SYSTEM_ADMIN_EMAIL,
            nonEmployee.getEmail());
    }

    @Test
    void departmentManagerWithoutAssignmentCannotManageMembership() throws Exception {
        Org org = newOrg();
        UUID dept = createDepartment(org.adminToken(), "Engineering");
        // Holds the role but is not assigned to any department.
        Manager unassignedManager = newDepartmentManager(org, "manager");
        Employee employee = newEmployee(org, "emp");

        listUnassigned(unassignedManager.token()).andExpect(status().isForbidden());
        addMember(unassignedManager.token(), dept, employee.userId())
            .andExpect(status().isForbidden());
    }

    @Test
    void managerListsOnlyManagedDepartmentMembers() throws Exception {
        Org org = newOrg();
        UUID deptA = createDepartment(org.adminToken(), "Engineering");
        UUID deptB = createDepartment(org.adminToken(), "Design");
        Manager mgrA = newDepartmentManager(org, "a");
        assignManager(org.adminToken(), deptA, mgrA.userId()).andExpect(status().isOk());

        // Managing deptA, listing deptB (another department) is anti-leak 404.
        listMembers(mgrA.token(), deptB).andExpect(status().isNotFound());

        // Another organization's department is also 404.
        Org foreign = newOrg();
        UUID foreignDept = createDepartment(foreign.adminToken(), "Engineering");
        listMembers(mgrA.token(), foreignDept).andExpect(status().isNotFound());

        listMembers(mgrA.token(), deptA).andExpect(status().isOk());
    }

    @Test
    void managerAssignsMemberWithUuidIdAssignedByManagerAndCorrectCount() throws Exception {
        Org org = newOrg();
        UUID dept = createDepartment(org.adminToken(), "Engineering");
        Manager manager = newDepartmentManager(org, "manager");
        assignManager(org.adminToken(), dept, manager.userId()).andExpect(status().isOk());
        Employee employee = newEmployee(org, "emp");

        addMember(manager.token(), dept, employee.userId()).andExpect(status().isOk());

        DepartmentMembership membership =
            membershipRepository.findByMember_Id(employee.userId()).orElseThrow();
        assertThat(membership.getId()).isInstanceOf(UUID.class);
        assertThat(membership.getAssignedBy().getId()).isEqualTo(manager.userId());
        assertThat(membership.getDepartment().getId()).isEqualTo(dept);

        assertThat(getDepartment(org.adminToken(), dept).get("memberCount").asLong()).isEqualTo(1);

        // Idempotent re-assignment.
        addMember(manager.token(), dept, employee.userId()).andExpect(status().isOk());
        assertThat(getDepartment(org.adminToken(), dept).get("memberCount").asLong()).isEqualTo(1);
    }

    @Test
    void userCannotBelongToTwoDepartments() throws Exception {
        Org org = newOrg();
        UUID deptA = createDepartment(org.adminToken(), "Engineering");
        UUID deptB = createDepartment(org.adminToken(), "Design");
        Manager mgrA = newDepartmentManager(org, "a");
        Manager mgrB = newDepartmentManager(org, "b");
        assignManager(org.adminToken(), deptA, mgrA.userId()).andExpect(status().isOk());
        assignManager(org.adminToken(), deptB, mgrB.userId()).andExpect(status().isOk());
        Employee employee = newEmployee(org, "emp");

        addMember(mgrA.token(), deptA, employee.userId()).andExpect(status().isOk());
        addMember(mgrB.token(), deptB, employee.userId()).andExpect(status().isConflict());
    }

    @Test
    void databaseUniqueMemberUserIdIsEnforced() throws Exception {
        Org org = newOrg();
        Organization organization = organizationRepository.findById(org.orgId()).orElseThrow();
        Department deptA = departmentRepository.saveAndFlush(
            new Department(organization, "Eng", "eng-" + UUID.randomUUID()));
        Department deptB = departmentRepository.saveAndFlush(
            new Department(organization, "Design", "design-" + UUID.randomUUID()));
        Employee employee = newEmployee(org, "emp");
        User member = userRepository.findById(employee.userId()).orElseThrow();
        User admin = userRepository.findById(org.adminId()).orElseThrow();

        membershipRepository.saveAndFlush(new DepartmentMembership(deptA, member, admin));

        assertThatThrownBy(() -> membershipRepository.saveAndFlush(
            new DepartmentMembership(deptB, member, admin)))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void movingDepartmentRequiresRemoveThenAdd() throws Exception {
        Org org = newOrg();
        UUID deptA = createDepartment(org.adminToken(), "Engineering");
        UUID deptB = createDepartment(org.adminToken(), "Design");
        Manager mgrA = newDepartmentManager(org, "a");
        Manager mgrB = newDepartmentManager(org, "b");
        assignManager(org.adminToken(), deptA, mgrA.userId()).andExpect(status().isOk());
        assignManager(org.adminToken(), deptB, mgrB.userId()).andExpect(status().isOk());
        Employee employee = newEmployee(org, "emp");

        addMember(mgrA.token(), deptA, employee.userId()).andExpect(status().isOk());

        // 1. old manager removes
        removeMember(mgrA.token(), deptA, employee.userId()).andExpect(status().isNoContent());
        // 2. user appears unassigned
        assertThat(emailsOf(listUnassigned(mgrB.token()))).contains(employee.email());
        // 3. new manager assigns
        addMember(mgrB.token(), deptB, employee.userId()).andExpect(status().isOk());

        assertThat(membershipRepository.findByMember_Id(employee.userId()).orElseThrow()
            .getDepartment().getId()).isEqualTo(deptB);
    }

    @Test
    void removeIsIdempotentAntiLeakForForeignMembersAndNeverDeletesUser() throws Exception {
        Org org = newOrg();
        UUID deptA = createDepartment(org.adminToken(), "Engineering");
        UUID deptB = createDepartment(org.adminToken(), "Design");
        Manager mgrA = newDepartmentManager(org, "a");
        Manager mgrB = newDepartmentManager(org, "b");
        assignManager(org.adminToken(), deptA, mgrA.userId()).andExpect(status().isOk());
        assignManager(org.adminToken(), deptB, mgrB.userId()).andExpect(status().isOk());
        Employee employee = newEmployee(org, "emp");
        addMember(mgrA.token(), deptA, employee.userId()).andExpect(status().isOk());

        // Manager of another department cannot remove this member (anti-leak 404).
        removeMember(mgrB.token(), deptB, employee.userId()).andExpect(status().isNotFound());

        // Cross-org user probing returns 404.
        Org foreign = newOrg();
        Employee foreignEmployee = newEmployee(foreign, "foreign");
        removeMember(mgrA.token(), deptA, foreignEmployee.userId())
            .andExpect(status().isNotFound());

        // Owning manager removes the member, then a repeat removal is idempotent.
        removeMember(mgrA.token(), deptA, employee.userId()).andExpect(status().isNoContent());
        removeMember(mgrA.token(), deptA, employee.userId()).andExpect(status().isNoContent());

        // The User row is never deleted.
        assertThat(userRepository.findById(employee.userId())).isPresent();
    }

    @Test
    void managerAssignmentAndMembershipAreIndependent() throws Exception {
        Org org = newOrg();
        UUID dept = createDepartment(org.adminToken(), "Engineering");
        Manager manager = newDepartmentManager(org, "manager");
        assignManager(org.adminToken(), dept, manager.userId()).andExpect(status().isOk());

        // Assigning a manager creates no membership.
        assertThat(membershipRepository.findByMember_Id(manager.userId())).isEmpty();

        Employee employee = newEmployee(org, "emp");
        addMember(manager.token(), dept, employee.userId()).andExpect(status().isOk());

        // Removing membership does not remove the manager assignment.
        removeMember(manager.token(), dept, employee.userId()).andExpect(status().isNoContent());
        assertThat(assignmentRepository.findByDepartment_Id(dept)).isPresent();

        // Removing the manager assignment does not remove an existing membership.
        addMember(manager.token(), dept, employee.userId()).andExpect(status().isOk());
        unassignManager(org.adminToken(), dept).andExpect(status().isNoContent());
        assertThat(membershipRepository.findByMember_Id(employee.userId())).isPresent();
    }

    @Test
    void departmentWithMembershipCannotBeDeletedUntilCleared() throws Exception {
        Org org = newOrg();
        UUID dept = createDepartment(org.adminToken(), "Engineering");
        Manager manager = newDepartmentManager(org, "manager");
        assignManager(org.adminToken(), dept, manager.userId()).andExpect(status().isOk());
        Employee employee = newEmployee(org, "emp");
        addMember(manager.token(), dept, employee.userId()).andExpect(status().isOk());

        // Has both a manager and a member: not deletable.
        deleteDepartment(org.adminToken(), dept).andExpect(status().isConflict());

        removeMember(manager.token(), dept, employee.userId()).andExpect(status().isNoContent());
        // Still has a manager: not deletable.
        deleteDepartment(org.adminToken(), dept).andExpect(status().isConflict());

        unassignManager(org.adminToken(), dept).andExpect(status().isNoContent());
        // Now empty: deletable.
        deleteDepartment(org.adminToken(), dept).andExpect(status().isNoContent());
    }

    private org.springframework.test.web.servlet.ResultActions deleteDepartment(
        String token, UUID deptId) throws Exception {
        return mockMvc.perform(
            org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .delete("/departments/" + deptId)
                .header(org.springframework.http.HttpHeaders.AUTHORIZATION, bearer(token)));
    }
}
