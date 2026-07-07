package me.aydgn.potriv.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.ResultActions;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;
import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.entity.UserRole;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.identity.repository.UserRoleRepository;

class RoleManagementIntegrationTest extends AbstractMockMvcIntegrationTest {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private UserRoleRepository userRoleRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private String adminAEmail;
    private String adminAToken;
    private UUID adminAUserId;
    private UUID organizationAId;
    private UUID employeeAUserId;
    private UUID employeeBUserId;

    @BeforeEach
    void setUpTwoOrganizations() throws Exception {
        adminAEmail = uniqueEmail("admin-a");
        JsonNode adminA = registerAdmin(uniqueName("Org A"), adminAEmail, "Password123!");
        organizationAId = UUID.fromString(adminA.get("organizationId").asText());
        adminAUserId = UUID.fromString(adminA.get("userId").asText());

        String employeeAEmail = uniqueEmail("employee-a");
        JsonNode employeeA = registerEmployee(
            extractInviteToken(adminA.get("employeeInviteUrl").asText()),
            employeeAEmail,
            "Password123!"
        );
        employeeAUserId = UUID.fromString(employeeA.get("userId").asText());

        JsonNode adminB = registerAdmin(uniqueName("Org B"), uniqueEmail("admin-b"), "Password123!");
        JsonNode employeeB = registerEmployee(
            extractInviteToken(adminB.get("employeeInviteUrl").asText()),
            uniqueEmail("employee-b"),
            "Password123!"
        );
        employeeBUserId = UUID.fromString(employeeB.get("userId").asText());

        adminAToken = loginForAccessToken(adminAEmail, "Password123!");
    }

    @Test
    void organizationAdminListsOnlyUsersFromOwnOrganization() throws Exception {
        String response = mockMvc.perform(get("/users")
                .header(HttpHeaders.AUTHORIZATION, bearer(adminAToken)))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();

        JsonNode users = objectMapper.readTree(response);

        assertThat(users.isArray()).isTrue();
        assertThat(users).isNotEmpty();
        users.forEach(user ->
            assertThat(user.get("organizationId").asText()).isEqualTo(organizationAId.toString())
        );
    }

    @Test
    void systemAdminListsUsersAcrossOrganizations() throws Exception {
        String response = mockMvc.perform(get("/users")
                .header(HttpHeaders.AUTHORIZATION, bearer(systemAdminAccessToken())))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();

        JsonNode users = objectMapper.readTree(response);

        Set<String> userIds = new java.util.HashSet<>();
        users.forEach(user -> userIds.add(user.get("userId").asText()));

        assertThat(userIds).contains(employeeAUserId.toString(), employeeBUserId.toString());
    }

    @Test
    void organizationAdminCannotSeeAnotherOrganizationsUserDetail() throws Exception {
        mockMvc.perform(get("/users/" + employeeBUserId)
                .header(HttpHeaders.AUTHORIZATION, bearer(adminAToken)))
            .andExpect(status().isNotFound());
    }

    @Test
    void organizationAdminCannotUpdateAnotherOrganizationsUser() throws Exception {
        updateRoles(adminAToken, employeeBUserId, List.of("EMPLOYEE", "PROJECT_MANAGER"))
            .andExpect(status().isNotFound());
    }

    @Test
    void organizationAdminCannotAssignSystemAdmin() throws Exception {
        updateRoles(adminAToken, employeeAUserId, List.of("EMPLOYEE", "SYSTEM_ADMIN"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void userCanHoldMultipleRoles() throws Exception {
        updateRoles(adminAToken, employeeAUserId,
            List.of("EMPLOYEE", "PROJECT_MANAGER", "DEPARTMENT_MANAGER"))
            .andExpect(status().isOk());

        User employee = userRepository.findById(employeeAUserId).orElseThrow();

        assertThat(userRoleRepository.findByUser(employee))
            .extracting(UserRole::getRole)
            .containsExactlyInAnyOrder(
                AccessRole.EMPLOYEE,
                AccessRole.PROJECT_MANAGER,
                AccessRole.DEPARTMENT_MANAGER
            );
    }

    @Test
    void employeeRoleRemainsMandatoryForOrganizationUsers() throws Exception {
        updateRoles(adminAToken, employeeAUserId, List.of("PROJECT_MANAGER"))
            .andExpect(status().isOk());

        User employee = userRepository.findById(employeeAUserId).orElseThrow();

        assertThat(userRoleRepository.findByUser(employee))
            .extracting(UserRole::getRole)
            .contains(AccessRole.EMPLOYEE);
    }

    @Test
    void ownRoleUpdateIsBlocked() throws Exception {
        updateRoles(adminAToken, adminAUserId, List.of("EMPLOYEE"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void lastOrganizationAdminRemovalIsBlocked() throws Exception {
        updateRoles(systemAdminAccessToken(), adminAUserId, List.of("EMPLOYEE"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void platformUserRoleRulesAreEnforced() throws Exception {
        User platformUser = userRepository.save(new User(
            null,
            "Platform User",
            uniqueEmail("platform"),
            passwordEncoder.encode("Password123!")
        ));
        userRoleRepository.save(new UserRole(platformUser, AccessRole.SYSTEM_ADMIN));

        // Platform users may hold only the SYSTEM_ADMIN role.
        updateRoles(systemAdminAccessToken(), platformUser.getId(), List.of("PROJECT_MANAGER"))
            .andExpect(status().isBadRequest());

        // SYSTEM_ADMIN cannot be assigned to organization users.
        updateRoles(systemAdminAccessToken(), employeeAUserId, List.of("EMPLOYEE", "SYSTEM_ADMIN"))
            .andExpect(status().isBadRequest());
    }

    private ResultActions updateRoles(String accessToken, UUID userId, List<String> roles)
        throws Exception {

        String body = objectMapper.writeValueAsString(Map.of("roles", roles));

        return mockMvc.perform(patch("/users/" + userId + "/roles")
            .header(HttpHeaders.AUTHORIZATION, bearer(accessToken))
            .contentType(MediaType.APPLICATION_JSON)
            .content(body));
    }
}
