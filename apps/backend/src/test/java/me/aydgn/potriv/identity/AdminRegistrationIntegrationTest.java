package me.aydgn.potriv.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;

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

class AdminRegistrationIntegrationTest extends AbstractMockMvcIntegrationTest {

    @Autowired
    private OrganizationRepository organizationRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private UserRoleRepository userRoleRepository;

    @Autowired
    private InviteTokenRepository inviteTokenRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Test
    void validRequestCreatesOrganizationUserRolesAndActiveInvite() throws Exception {
        String email = uniqueEmail("admin");
        String organizationName = uniqueName("Org");

        JsonNode response = registerAdmin(organizationName, email, "Password123!");

        UUID organizationId = UUID.fromString(response.get("organizationId").asText());
        UUID userId = UUID.fromString(response.get("userId").asText());

        Organization organization = organizationRepository.findById(organizationId).orElseThrow();
        assertThat(organization.getName()).isEqualTo(organizationName);

        User admin = userRepository.findById(userId).orElseThrow();
        assertThat(admin.getEmail()).isEqualTo(email);
        assertThat(admin.getOrganization().getId()).isEqualTo(organizationId);

        assertThat(userRoleRepository.findByUser(admin))
            .extracting(UserRole::getRole)
            .containsExactlyInAnyOrder(AccessRole.EMPLOYEE, AccessRole.ORGANIZATION_ADMIN);

        assertThat(inviteTokenRepository
            .findFirstByOrganizationAndActiveTrueOrderByCreatedAtDesc(organization))
            .isPresent();

        assertThat(response.get("employeeInviteUrl").asText()).contains("token=");
    }

    @Test
    void emailIsNormalizedToTrimmedLowercase() throws Exception {
        String localPart = "Admin-" + UUID.randomUUID();
        String mixedCaseEmail = localPart + "@Potriv.TEST";

        registerAdmin(uniqueName("Org"), mixedCaseEmail, "Password123!");

        assertThat(userRepository.findByEmail(mixedCaseEmail.toLowerCase())).isPresent();
        assertThat(userRepository.findByEmail(mixedCaseEmail)).isEmpty();
    }

    @Test
    void passwordIsBcryptEncodedAndNotStoredRaw() throws Exception {
        String email = uniqueEmail("admin");
        String rawPassword = "Password123!";

        registerAdmin(uniqueName("Org"), email, rawPassword);

        User admin = userRepository.findByEmail(email).orElseThrow();
        assertThat(admin.getPasswordHash()).startsWith("$2");
        assertThat(admin.getPasswordHash()).isNotEqualTo(rawPassword);
        assertThat(passwordEncoder.matches(rawPassword, admin.getPasswordHash())).isTrue();
    }

    @Test
    void duplicateEmailIsRejected() throws Exception {
        String email = uniqueEmail("admin");

        registerAdmin(uniqueName("Org"), email, "Password123!");

        String body = objectMapper.writeValueAsString(Map.of(
            "name", "Second Admin",
            "email", email,
            "password", "Password123!",
            "organizationName", uniqueName("Org"),
            "headquarterAddress", "Test Address 2"
        ));

        mockMvc.perform(post("/auth/register-admin")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
            .andExpect(status().isBadRequest());
    }

    @Test
    void invalidDtoInputIsRejected() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
            "name", "Bad Admin",
            "email", "not-an-email",
            "password", "short",
            "organizationName", "",
            "headquarterAddress", "Test Address 3"
        ));

        mockMvc.perform(post("/auth/register-admin")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
            .andExpect(status().isBadRequest());
    }
}
