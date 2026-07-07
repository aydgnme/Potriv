package me.aydgn.potriv.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;
import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.entity.UserRole;
import me.aydgn.potriv.identity.repository.InviteTokenRepository;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.identity.repository.UserRoleRepository;
import me.aydgn.potriv.organization.entity.Organization;
import me.aydgn.potriv.organization.repository.OrganizationRepository;
import org.springframework.security.crypto.password.PasswordEncoder;

class InviteLifecycleIntegrationTest extends AbstractMockMvcIntegrationTest {

    @Autowired
    private InviteTokenRepository inviteTokenRepository;

    @Autowired
    private OrganizationRepository organizationRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private UserRoleRepository userRoleRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Test
    void organizationAdminGetsActiveInvite() throws Exception {
        String email = uniqueEmail("admin");
        JsonNode admin = registerAdmin(uniqueName("Org"), email, "Password123!");
        UUID organizationId = UUID.fromString(admin.get("organizationId").asText());
        String token = loginForAccessToken(email, "Password123!");

        String response = mockMvc.perform(get("/organizations/current/invite")
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();

        JsonNode invite = objectMapper.readTree(response);
        assertThat(invite.get("active").asBoolean()).isTrue();
        assertThat(invite.get("inviteUrl").asText()).contains("token=");
        assertThat(invite.has("token")).isFalse();
        assertThat(invite.get("inviteId").asText()).isNotBlank();
        // GET returns only the caller's own organization invite.
        Organization organization = organizationRepository.findById(organizationId).orElseThrow();
        assertThat(inviteTokenRepository
            .findFirstByOrganizationAndActiveTrueOrderByCreatedAtDesc(organization)
            .orElseThrow().getId().toString())
            .isEqualTo(invite.get("inviteId").asText());
    }

    @Test
    void employeeReceives403OnInviteEndpoints() throws Exception {
        JsonNode admin = registerAdmin(uniqueName("Org"), uniqueEmail("admin"), "Password123!");
        String employeeEmail = uniqueEmail("employee");
        registerEmployee(
            extractInviteToken(admin.get("employeeInviteUrl").asText()),
            employeeEmail,
            "Password123!"
        );
        String employeeToken = loginForAccessToken(employeeEmail, "Password123!");

        mockMvc.perform(get("/organizations/current/invite")
                .header(HttpHeaders.AUTHORIZATION, bearer(employeeToken)))
            .andExpect(status().isForbidden());
    }

    @Test
    void nonOrgAdminManagerReceives403() throws Exception {
        Organization organization = organizationRepository.save(
            new Organization(uniqueName("Org"), "Addr"));
        String managerEmail = uniqueEmail("manager");
        User manager = userRepository.save(new User(
            organization, "Manager", managerEmail, passwordEncoder.encode("Password123!")));
        userRoleRepository.save(new UserRole(manager, AccessRole.EMPLOYEE));
        userRoleRepository.save(new UserRole(manager, AccessRole.PROJECT_MANAGER));

        String managerToken = loginForAccessToken(managerEmail, "Password123!");

        mockMvc.perform(post("/organizations/current/invite/rotate")
                .header(HttpHeaders.AUTHORIZATION, bearer(managerToken)))
            .andExpect(status().isForbidden());
    }

    @Test
    void rotationDeactivatesPreviousInviteAndKeepsExactlyOneActive() throws Exception {
        String email = uniqueEmail("admin");
        JsonNode admin = registerAdmin(uniqueName("Org"), email, "Password123!");
        UUID organizationId = UUID.fromString(admin.get("organizationId").asText());
        String oldInviteToken = extractInviteToken(admin.get("employeeInviteUrl").asText());
        String token = loginForAccessToken(email, "Password123!");

        String rotateResponse = mockMvc.perform(post("/organizations/current/invite/rotate")
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();

        String newInviteToken = extractInviteToken(
            objectMapper.readTree(rotateResponse).get("inviteUrl").asText());

        // Previous invite is deactivated; the new one is different.
        assertThat(inviteTokenRepository.findByToken(oldInviteToken).orElseThrow().isActive())
            .isFalse();
        assertThat(newInviteToken).isNotEqualTo(oldInviteToken);

        Organization organization = organizationRepository.findById(organizationId).orElseThrow();
        assertThat(inviteTokenRepository.findAllByOrganizationAndActiveTrue(organization))
            .hasSize(1);

        // Old invite fails registration; new invite succeeds.
        mockMvc.perform(post("/auth/register-employee/" + oldInviteToken)
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(java.util.Map.of(
                    "name", "Late", "email", uniqueEmail("late"), "password", "Password123!"))))
            .andExpect(status().isBadRequest());

        registerEmployee(newInviteToken, uniqueEmail("new-emp"), "Password123!");
    }

    @Test
    void anotherOrganizationsInviteIsNeverReturned() throws Exception {
        String emailA = uniqueEmail("admin-a");
        JsonNode adminA = registerAdmin(uniqueName("Org A"), emailA, "Password123!");
        String tokenA = loginForAccessToken(emailA, "Password123!");

        String emailB = uniqueEmail("admin-b");
        JsonNode adminB = registerAdmin(uniqueName("Org B"), emailB, "Password123!");

        String responseA = mockMvc.perform(get("/organizations/current/invite")
                .header(HttpHeaders.AUTHORIZATION, bearer(tokenA)))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();

        String orgAInviteUrl = objectMapper.readTree(responseA).get("inviteUrl").asText();
        String orgAInviteToken = extractInviteToken(orgAInviteUrl);

        // Org A admin never receives org B's invite token.
        String orgBInviteToken = extractInviteToken(adminB.get("employeeInviteUrl").asText());
        assertThat(orgAInviteToken).isNotEqualTo(orgBInviteToken);
        assertThat(orgAInviteToken)
            .isEqualTo(extractInviteToken(adminA.get("employeeInviteUrl").asText()));
    }

    @Test
    void systemAdminWithoutOrganizationCannotUseCurrentOrganizationRoute() throws Exception {
        String token = systemAdminAccessToken();

        mockMvc.perform(get("/organizations/current/invite")
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isBadRequest());
    }
}
