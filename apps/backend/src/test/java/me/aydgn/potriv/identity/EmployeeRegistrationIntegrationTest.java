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
import me.aydgn.potriv.common.security.TokenDigest;
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

        String adminEmail = uniqueEmail("admin");
        JsonNode admin = registerAdmin(uniqueName("Org"), adminEmail, "Password123!");
        UUID organizationId = UUID.fromString(admin.get("organizationId").asText());
        String adminToken = loginForAccessToken(adminEmail, "Password123!");

        String email = uniqueEmail("employee");

        JsonNode response = inviteAndRegisterEmployee(adminToken, email, "Password123!");

        assertThat(UUID.fromString(response.get("organizationId").asText()))
            .isEqualTo(organizationId);

        User employee = userRepository.findByEmail(email).orElseThrow();
        assertThat(employee.getOrganization().getId()).isEqualTo(organizationId);

        assertThat(userRoleRepository.findByUser(employee))
            .extracting(UserRole::getRole)
            .containsExactly(AccessRole.EMPLOYEE);
    }

    /**
     * Every way an invitation can fail answers identically.
     *
     * This used to return 404 for a token that had never existed and 400 for one
     * that had expired or been revoked. That difference is an oracle: anyone
     * holding a guessed or intercepted token could learn whether it was ever
     * real, and — because the address is part of redemption — whether a given
     * person had been invited to a given workspace. Both are facts about people
     * who never agreed to publish them.
     *
     * So the assertion is not "each case is rejected", which the old split also
     * satisfied. It is that the four cases are *indistinguishable*: same status,
     * same body, byte for byte.
     */
    @Test
    void everyInvalidInviteAnswersIdentically() throws Exception {
        String adminEmail = uniqueEmail("admin");
        registerAdmin(uniqueName("Org"), adminEmail, "Password123!");
        String adminToken = loginForAccessToken(adminEmail, "Password123!");

        // 1. A token that never existed.
        String neverExisted = attemptRegistration(
            "completely-unknown-token", uniqueEmail("nobody"));

        // 2. A real token, revoked before it was spent.
        String revokedEmail = uniqueEmail("revoked");
        inviteEmployee(adminToken, revokedEmail);
        String revokedToken = inviteTokenFromMailTo(revokedEmail);
        InviteToken revoked = inviteTokenRepository
            .findByTokenHash(TokenDigest.sha256Base64Url(revokedToken)).orElseThrow();
        revoked.deactivate();
        inviteTokenRepository.save(revoked);
        String wasRevoked = attemptRegistration(revokedToken, revokedEmail);

        // 3. A real, live token — redeemed by the wrong person.
        String intendedEmail = uniqueEmail("intended");
        inviteEmployee(adminToken, intendedEmail);
        String liveToken = inviteTokenFromMailTo(intendedEmail);
        String wrongRecipient = attemptRegistration(liveToken, uniqueEmail("interloper"));

        // 4. A real token, already spent by the person it was for.
        registerEmployee(liveToken, intendedEmail, "Password123!");
        String alreadySpent = attemptRegistration(liveToken, intendedEmail);

        assertThat(neverExisted)
            .isEqualTo(wasRevoked)
            .isEqualTo(wrongRecipient)
            .isEqualTo(alreadySpent);

        // And the shared answer says nothing about which case it was.
        assertThat(neverExisted).doesNotContain("expired", "revoked", "not found", "unknown");
    }

    /** Attempts a registration and returns status and body as one comparable string. */
    private String attemptRegistration(String inviteToken, String email) throws Exception {
        var result = mockMvc.perform(post("/auth/register-employee")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "token", inviteToken,
                    "name", "Applicant",
                    "email", email,
                    "password", "Password123!"))))
            .andExpect(status().isBadRequest())
            .andReturn().getResponse();

        /*
          Only the clock legitimately differs between two identical failures.

          The path used to differ too, because the token was in it — so the
          comparison had to normalise it away. The route is fixed now, which
          makes these four responses identical in every byte but the timestamp,
          and makes this assertion strictly stronger than it was.
        */
        return result.getStatus() + " " + result.getContentAsString()
            .replaceAll("\"timestamp\"\\s*:\\s*\"[^\"]*\"", "\"timestamp\":\"-\"");
    }

    @Test
    void deactivatedInviteFailsRegistration() throws Exception {
        String adminEmail = uniqueEmail("admin");
        registerAdmin(uniqueName("Org"), adminEmail, "Password123!");
        String adminToken = loginForAccessToken(adminEmail, "Password123!");

        String employeeEmail = uniqueEmail("employee");
        inviteEmployee(adminToken, employeeEmail);
        String inviteToken = inviteTokenFromMailTo(employeeEmail);

        InviteToken invite = inviteTokenRepository.findByTokenHash(TokenDigest.sha256Base64Url(inviteToken)).orElseThrow();
        invite.deactivate();
        inviteTokenRepository.save(invite);

        String body = objectMapper.writeValueAsString(Map.of(
            "token", inviteToken,
            "name", "Late Employee",
            "email", employeeEmail,
            "password", "Password123!"
        ));

        mockMvc.perform(post("/auth/register-employee")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
            .andExpect(status().isBadRequest());
    }

    @Test
    void expiredInviteFailsRegistration() throws Exception {
        String adminEmail = uniqueEmail("admin");
        JsonNode admin = registerAdmin(uniqueName("Org"), adminEmail, "Password123!");
        UUID organizationId = UUID.fromString(admin.get("organizationId").asText());

        Organization organization = organizationRepository.findById(organizationId).orElseThrow();

        // Seeded directly, because the API cannot mint an invite that is
        // already past its expiry — which is the point of the expiry being
        // mandatory. Only the hash is stored, so the raw value lives here.
        String expiredToken = "expired-" + UUID.randomUUID();
        String invitedEmail = uniqueEmail("employee");
        inviteTokenRepository.save(new InviteToken(
            organization,
            TokenDigest.sha256Base64Url(expiredToken),
            invitedEmail,
            OffsetDateTime.now(ZoneOffset.UTC).minusDays(1)
        ));

        String body = objectMapper.writeValueAsString(Map.of(
            "token", expiredToken,
            "name", "Expired Employee",
            "email", invitedEmail,
            "password", "Password123!"
        ));

        mockMvc.perform(post("/auth/register-employee")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
            .andExpect(status().isBadRequest());
    }

    @Test
    void duplicateEmailFailsRegistration() throws Exception {
        String adminEmail = uniqueEmail("admin");
        registerAdmin(uniqueName("Org"), adminEmail, "Password123!");
        String adminToken = loginForAccessToken(adminEmail, "Password123!");

        String email = uniqueEmail("employee");
        inviteEmployee(adminToken, email);
        String inviteToken = inviteTokenFromMailTo(email);

        // The address is taken by a different account after the invite was
        // sent. The invite is still active and still addressed to this person,
        // so the duplicate-account guard is the only thing that can reject it.
        registerAdmin(uniqueName("Other Org"), email, "Password123!");

        String body = objectMapper.writeValueAsString(Map.of(
            "token", inviteToken,
            "name", "Duplicate Employee",
            "email", email,
            "password", "Password123!"
        ));

        mockMvc.perform(post("/auth/register-employee")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
            .andExpect(status().isBadRequest());
    }
}
