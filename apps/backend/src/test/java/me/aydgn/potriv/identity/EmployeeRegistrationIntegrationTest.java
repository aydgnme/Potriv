package me.aydgn.potriv.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;
import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.InviteToken;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.entity.UserRole;
import me.aydgn.potriv.identity.repository.InviteTokenRepository;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.identity.repository.UserRoleRepository;
import me.aydgn.potriv.organization.entity.Organization;
import me.aydgn.potriv.organization.repository.OrganizationRepository;

class EmployeeRegistrationIntegrationTest extends AbstractMockMvcIntegrationTest {

    @Autowired
    private OrganizationRepository organizationRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private UserRoleRepository userRoleRepository;

    @Autowired
    private InviteTokenRepository inviteTokenRepository;

    @Test
    void validActiveInviteCreatesEmployeeInCorrectOrganizationWithEmployeeRoleOnly()
        throws Exception {

        JsonNode admin = registerAdmin(uniqueName("Org"), uniqueEmail("admin"), "Password123!");
        UUID organizationId = UUID.fromString(admin.get("organizationId").asText());
        String inviteToken = extractInviteToken(admin.get("employeeInviteUrl").asText());

        String email = uniqueEmail("employee");

        JsonNode response = registerEmployee(inviteToken, email, "Password123!");

        assertThat(UUID.fromString(response.get("organizationId").asText()))
            .isEqualTo(organizationId);

        User employee = userRepository.findByEmail(email).orElseThrow();
        assertThat(employee.getOrganization().getId()).isEqualTo(organizationId);

        assertThat(userRoleRepository.findByUser(employee))
            .extracting(UserRole::getRole)
            .containsExactly(AccessRole.EMPLOYEE);
    }

    @Test
    void unknownInviteTokenIsRejected() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
            "name", "Nobody",
            "email", uniqueEmail("employee"),
            "password", "Password123!"
        ));

        mockMvc.perform(post("/auth/register-employee/completely-unknown-token")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
            .andExpect(status().isNotFound());
    }

    @Test
    void deactivatedInviteFailsRegistration() throws Exception {
        JsonNode admin = registerAdmin(uniqueName("Org"), uniqueEmail("admin"), "Password123!");
        String inviteToken = extractInviteToken(admin.get("employeeInviteUrl").asText());

        InviteToken invite = inviteTokenRepository.findByToken(inviteToken).orElseThrow();
        invite.deactivate();
        inviteTokenRepository.save(invite);

        String body = objectMapper.writeValueAsString(Map.of(
            "name", "Late Employee",
            "email", uniqueEmail("employee"),
            "password", "Password123!"
        ));

        mockMvc.perform(post("/auth/register-employee/" + inviteToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
            .andExpect(status().isBadRequest());
    }

    @Test
    void expiredInviteFailsRegistration() throws Exception {
        JsonNode admin = registerAdmin(uniqueName("Org"), uniqueEmail("admin"), "Password123!");
        UUID organizationId = UUID.fromString(admin.get("organizationId").asText());

        Organization organization = organizationRepository.findById(organizationId).orElseThrow();

        String expiredToken = "expired-" + UUID.randomUUID();
        inviteTokenRepository.save(new InviteToken(
            organization,
            expiredToken,
            OffsetDateTime.now(ZoneOffset.UTC).minusDays(1)
        ));

        String body = objectMapper.writeValueAsString(Map.of(
            "name", "Expired Employee",
            "email", uniqueEmail("employee"),
            "password", "Password123!"
        ));

        mockMvc.perform(post("/auth/register-employee/" + expiredToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
            .andExpect(status().isBadRequest());
    }

    @Test
    void duplicateEmailFailsRegistration() throws Exception {
        JsonNode admin = registerAdmin(uniqueName("Org"), uniqueEmail("admin"), "Password123!");
        String inviteToken = extractInviteToken(admin.get("employeeInviteUrl").asText());

        String email = uniqueEmail("employee");
        registerEmployee(inviteToken, email, "Password123!");

        String body = objectMapper.writeValueAsString(Map.of(
            "name", "Duplicate Employee",
            "email", email,
            "password", "Password123!"
        ));

        mockMvc.perform(post("/auth/register-employee/" + inviteToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
            .andExpect(status().isBadRequest());
    }
}
