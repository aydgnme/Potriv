package me.aydgn.potriv.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;
import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.identity.repository.UserRoleRepository;

/**
 * The founder of a brand-new organization is its only user. They must be able to
 * finish initial setup without a second human existing purely to grant them a
 * role — but the general rule that a user cannot rewrite their own authorization
 * must survive intact.
 *
 * <p>Every test here either proves the bootstrap works or proves a boundary it
 * must not cross. {@link RoleManagementIntegrationTest} covers the ordinary
 * multi-user organization and is deliberately left untouched: it runs against an
 * organization with two users, so if the exception ever widened beyond a solo
 * organization, that suite would fail.
 */
class SoloOrganizationBootstrapIntegrationTest extends AbstractMockMvcIntegrationTest {

    private static final String PASSWORD = "Password123!";

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private UserRoleRepository userRoleRepository;

    private String founderEmail;
    private String founderToken;
    private UUID founderUserId;
    private String inviteToken;

    @BeforeEach
    void registerSoloOrganization() throws Exception {
        founderEmail = uniqueEmail("founder");
        JsonNode founder = registerAdmin(uniqueName("Solo Org"), founderEmail, PASSWORD);
        founderUserId = UUID.fromString(founder.get("userId").asText());
        inviteToken = extractInviteToken(founder.get("employeeInviteUrl").asText());
        founderToken = loginForAccessToken(founderEmail, PASSWORD);
    }

    // ---- the bootstrap itself ----

    @Test
    void soloFounderCanAddDepartmentManagerToOwnAccount() throws Exception {
        updateOwnRoles(List.of("EMPLOYEE", "ORGANIZATION_ADMIN", "DEPARTMENT_MANAGER"))
            .andExpect(status().isOk());

        assertThat(rolesOfFounder())
            .containsExactlyInAnyOrder(
                AccessRole.EMPLOYEE, AccessRole.ORGANIZATION_ADMIN, AccessRole.DEPARTMENT_MANAGER);
    }

    @Test
    void soloFounderCanAddBothOperationalRolesAtOnce() throws Exception {
        updateOwnRoles(List.of(
            "EMPLOYEE", "ORGANIZATION_ADMIN", "DEPARTMENT_MANAGER", "PROJECT_MANAGER"))
            .andExpect(status().isOk());

        assertThat(rolesOfFounder())
            .containsExactlyInAnyOrder(
                AccessRole.EMPLOYEE,
                AccessRole.ORGANIZATION_ADMIN,
                AccessRole.DEPARTMENT_MANAGER,
                AccessRole.PROJECT_MANAGER);
    }

    @Test
    void bootstrapPreservesEmployeeEvenWhenOmittedFromTheRequest() throws Exception {
        updateOwnRoles(List.of("ORGANIZATION_ADMIN", "PROJECT_MANAGER"))
            .andExpect(status().isOk());

        assertThat(rolesOfFounder()).contains(AccessRole.EMPLOYEE);
    }

    // ---- boundaries the bootstrap must not cross ----

    @Test
    void soloFounderCannotAssignSystemAdminToSelf() throws Exception {
        updateOwnRoles(List.of("EMPLOYEE", "ORGANIZATION_ADMIN", "SYSTEM_ADMIN"))
            .andExpect(status().isBadRequest());

        assertThat(rolesOfFounder()).doesNotContain(AccessRole.SYSTEM_ADMIN);
    }

    @Test
    void soloFounderCannotDropOwnOrganizationAdminRole() throws Exception {
        updateOwnRoles(List.of("EMPLOYEE", "DEPARTMENT_MANAGER"))
            .andExpect(status().isBadRequest());

        assertThat(rolesOfFounder()).contains(AccessRole.ORGANIZATION_ADMIN);
    }

    @Test
    void bootstrapIsAdditiveOnlyAndCannotRemoveAnEarlierGrant() throws Exception {
        updateOwnRoles(List.of(
            "EMPLOYEE", "ORGANIZATION_ADMIN", "DEPARTMENT_MANAGER", "PROJECT_MANAGER"))
            .andExpect(status().isOk());

        // Dropping PROJECT_MANAGER again is a removal, not a bootstrap.
        updateOwnRoles(List.of("EMPLOYEE", "ORGANIZATION_ADMIN", "DEPARTMENT_MANAGER"))
            .andExpect(status().isBadRequest());

        assertThat(rolesOfFounder()).contains(AccessRole.PROJECT_MANAGER);
    }

    @Test
    void nonAdminSoloUserCannotBootstrapThemselves() throws Exception {
        // A second organization whose invited employee is not an administrator.
        JsonNode otherFounder =
            registerAdmin(uniqueName("Other Org"), uniqueEmail("other-founder"), PASSWORD);
        String employeeEmail = uniqueEmail("plain-employee");
        registerEmployee(
            extractInviteToken(otherFounder.get("employeeInviteUrl").asText()),
            employeeEmail,
            PASSWORD);
        String employeeToken = loginForAccessToken(employeeEmail, PASSWORD);

        UUID employeeId = userRepository.findByEmail(employeeEmail).orElseThrow().getId();

        // /users is organization-admin only, so a plain employee is stopped by the
        // role guard before the bootstrap rule is ever consulted.
        mockMvc.perform(patch("/users/{id}/roles", employeeId)
                .header("Authorization", bearer(employeeToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"roles\":[\"EMPLOYEE\",\"DEPARTMENT_MANAGER\"]}"))
            .andExpect(status().isForbidden());
    }

    @Test
    void founderCannotBootstrapOnceTheOrganizationHasASecondUser() throws Exception {
        registerEmployee(inviteToken, uniqueEmail("second"), PASSWORD);

        updateOwnRoles(List.of("EMPLOYEE", "ORGANIZATION_ADMIN", "DEPARTMENT_MANAGER"))
            .andExpect(status().isBadRequest());

        assertThat(rolesOfFounder()).doesNotContain(AccessRole.DEPARTMENT_MANAGER);
    }

    @Test
    void bootstrapGrantedWhileSoloSurvivesLaterGrowth() throws Exception {
        updateOwnRoles(List.of("EMPLOYEE", "ORGANIZATION_ADMIN", "DEPARTMENT_MANAGER"))
            .andExpect(status().isOk());

        registerEmployee(inviteToken, uniqueEmail("later"), PASSWORD);

        // The grant stands; only further self-service is closed off.
        assertThat(rolesOfFounder()).contains(AccessRole.DEPARTMENT_MANAGER);
        updateOwnRoles(List.of(
            "EMPLOYEE", "ORGANIZATION_ADMIN", "DEPARTMENT_MANAGER", "PROJECT_MANAGER"))
            .andExpect(status().isBadRequest());
    }

    // ---- the workflow the blocker actually blocked ----

    @Test
    void soloFounderCompletesOperationalSetupEndToEnd() throws Exception {
        // 1. Grant the operational roles the rest of the workflow requires.
        updateOwnRoles(List.of(
            "EMPLOYEE", "ORGANIZATION_ADMIN", "DEPARTMENT_MANAGER", "PROJECT_MANAGER"))
            .andExpect(status().isOk());

        // A fresh token: authorities are carried in the access token.
        founderToken = loginForAccessToken(founderEmail, PASSWORD);

        // 2. Create a department.
        MvcResult department = mockMvc.perform(post("/departments")
                .header("Authorization", bearer(founderToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"" + uniqueName("Platform") + "\"}"))
            .andExpect(status().isCreated())
            .andReturn();
        UUID departmentId = UUID.fromString(
            objectMapper.readTree(department.getResponse().getContentAsString())
                .get("departmentId").asText());

        // 3. Become its manager — this is the step that needed DEPARTMENT_MANAGER.
        mockMvc.perform(put("/departments/{id}/manager", departmentId)
                .header("Authorization", bearer(founderToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"userId\":\"" + founderUserId + "\"}"))
            .andExpect(status().isOk());

        // 4. Place themselves into the department they now manage.
        mockMvc.perform(post("/departments/{deptId}/members/{userId}", departmentId, founderUserId)
                .header("Authorization", bearer(founderToken)))
            .andExpect(status().isOk());

        // 5. Create a project — this is the step that needed PROJECT_MANAGER.
        MvcResult project = mockMvc.perform(post("/projects")
                .header("Authorization", bearer(founderToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "name": "%s",
                      "period": "FIXED",
                      "startDate": "2026-03-12",
                      "deadlineDate": "2026-09-30",
                      "status": "NOT_STARTED",
                      "generalDescription": "Solo bootstrap project.",
                      "technologyStack": ["Java"],
                      "teamRoles": []
                    }
                    """.formatted(uniqueName("Apollo"))))
            .andExpect(status().isCreated())
            .andReturn();
        UUID projectId = UUID.fromString(objectMapper
            .readTree(project.getResponse().getContentAsString()).get("projectId").asText());

        // 6. Both halves of the staffing handshake are now reachable by one person.
        mockMvc.perform(post("/projects/{id}/team-finder", projectId)
                .header("Authorization", bearer(founderToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isOk());

        mockMvc.perform(get("/department/project-proposals")
                .header("Authorization", bearer(founderToken)))
            .andExpect(status().isOk());
    }

    // ---- helpers ----

    private org.springframework.test.web.servlet.ResultActions updateOwnRoles(List<String> roles)
        throws Exception {
        String body = roles.stream()
            .map(role -> "\"" + role + "\"")
            .reduce((left, right) -> left + "," + right)
            .map(joined -> "{\"roles\":[" + joined + "]}")
            .orElse("{\"roles\":[]}");

        return mockMvc.perform(patch("/users/{id}/roles", founderUserId)
            .header("Authorization", bearer(founderToken))
            .contentType(MediaType.APPLICATION_JSON)
            .content(body));
    }

    private List<AccessRole> rolesOfFounder() {
        return userRoleRepository
            .findByUser(userRepository.findById(founderUserId).orElseThrow())
            .stream()
            .map(me.aydgn.potriv.identity.entity.UserRole::getRole)
            .toList();
    }
}
