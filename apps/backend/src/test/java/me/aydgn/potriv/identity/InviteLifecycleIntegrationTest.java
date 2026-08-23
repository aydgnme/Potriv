package me.aydgn.potriv.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;
import me.aydgn.potriv.common.security.TokenDigest;
import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.InviteToken;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.entity.UserRole;
import me.aydgn.potriv.identity.repository.InviteTokenRepository;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.identity.repository.UserRoleRepository;
import me.aydgn.potriv.organization.entity.Organization;
import me.aydgn.potriv.organization.repository.OrganizationRepository;

/**
 * The lifecycle of an invitation, under the model that replaced the shared
 * organization link.
 *
 * An invite is now addressed to one person. There is no standing link to fetch
 * and no rotation, because there is nothing organization-wide left to rotate:
 * an admin names an address, the backend mails that address, and the resulting
 * credential redeems exactly once for exactly that person.
 *
 * The admin's browser never receives the raw token — the tests below assert
 * that directly, because it is the property the whole change exists to create.
 */
class InviteLifecycleIntegrationTest extends AbstractMockMvcIntegrationTest {

    private static final String PASSWORD = "Password123!";
    private static final String INVITES = "/organizations/current/invites";

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

    // ---- issuing ----

    @Test
    @DisplayName("a newly registered organization has no invitations at all")
    void registrationMintsNoInvite() throws Exception {
        String email = uniqueEmail("admin");
        registerAdmin(uniqueName("Org"), email, PASSWORD);
        String token = loginForAccessToken(email, PASSWORD);

        assertThat(listInvites(token)).isEmpty();
    }

    @Test
    @DisplayName("the invite response carries metadata only — never the token")
    void inviteResponseNeverCarriesTheRawToken() throws Exception {
        String adminEmail = uniqueEmail("admin");
        registerAdmin(uniqueName("Org"), adminEmail, PASSWORD);
        String adminToken = loginForAccessToken(adminEmail, PASSWORD);

        String employeeEmail = uniqueEmail("employee");
        String body = mockMvc.perform(post(INVITES)
                .header(HttpHeaders.AUTHORIZATION, bearer(adminToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("email", employeeEmail))))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();

        JsonNode invite = objectMapper.readTree(body);
        assertThat(invite.get("inviteId").asText()).isNotBlank();
        assertThat(invite.get("status").asText()).isEqualTo("PENDING");
        assertThat(invite.get("createdAt").asText()).isNotBlank();
        assertThat(invite.get("expiresAt").asText()).isNotBlank();

        // No field carries it, and no field is a token by another name.
        assertThat(invite.has("token")).isFalse();
        assertThat(invite.has("rawToken")).isFalse();
        assertThat(invite.has("inviteUrl")).isFalse();
        assertThat(invite.has("employeeInviteUrl")).isFalse();

        // The real token, taken from the mail the backend sent, appears nowhere
        // in the response — this is the assertion that would have caught a leak
        // through a field nobody thought to name.
        String rawToken = inviteTokenFromMailTo(employeeEmail);
        assertThat(body).doesNotContain(rawToken);
        assertThat(body).doesNotContain("token=");
    }

    @Test
    @DisplayName("the listed address is masked")
    void listedAddressIsMasked() throws Exception {
        String adminEmail = uniqueEmail("admin");
        registerAdmin(uniqueName("Org"), adminEmail, PASSWORD);
        String adminToken = loginForAccessToken(adminEmail, PASSWORD);

        String employeeEmail = uniqueEmail("employee");
        inviteEmployee(adminToken, employeeEmail);

        JsonNode listed = listInvites(adminToken).get(0);
        String masked = listed.get("maskedEmail").asText();

        assertThat(masked).contains("*");
        assertThat(masked).isNotEqualTo(employeeEmail);
        assertThat(masked).endsWith(employeeEmail.substring(employeeEmail.indexOf('@')));
    }

    // ---- re-inviting ----

    @Test
    @DisplayName("re-inviting the same address revokes the previous invitation")
    void reinviteRevokesThePreviousInvitation() throws Exception {
        String adminEmail = uniqueEmail("admin");
        registerAdmin(uniqueName("Org"), adminEmail, PASSWORD);
        String adminToken = loginForAccessToken(adminEmail, PASSWORD);

        String employeeEmail = uniqueEmail("employee");
        inviteEmployee(adminToken, employeeEmail);
        String firstToken = inviteTokenFromMailTo(employeeEmail);

        inviteEmployee(adminToken, employeeEmail);
        String secondToken = inviteTokenFromMailTo(employeeEmail);

        assertThat(secondToken).isNotEqualTo(firstToken);
        assertThat(inviteByRawToken(firstToken).isActive()).isFalse();
        assertThat(inviteByRawToken(secondToken).isActive()).isTrue();

        // The superseded link is dead, and the current one still works.
        mockMvc.perform(post("/auth/register-employee")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "token", firstToken,
                    "name", "Late", "email", employeeEmail, "password", PASSWORD))))
            .andExpect(status().isBadRequest());

        registerEmployee(secondToken, employeeEmail, PASSWORD);
    }

    // ---- revoking ----

    @Test
    @DisplayName("a revoked invitation cannot be redeemed")
    void revokedInvitationCannotBeRedeemed() throws Exception {
        String adminEmail = uniqueEmail("admin");
        registerAdmin(uniqueName("Org"), adminEmail, PASSWORD);
        String adminToken = loginForAccessToken(adminEmail, PASSWORD);

        String employeeEmail = uniqueEmail("employee");
        JsonNode invite = inviteEmployee(adminToken, employeeEmail);
        String rawToken = inviteTokenFromMailTo(employeeEmail);

        mockMvc.perform(delete(INVITES + "/" + invite.get("inviteId").asText())
                .header(HttpHeaders.AUTHORIZATION, bearer(adminToken)))
            .andExpect(status().isNoContent());

        mockMvc.perform(post("/auth/register-employee")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "token", rawToken,
                    "name", "Revoked", "email", employeeEmail, "password", PASSWORD))))
            .andExpect(status().isBadRequest());
    }

    // ---- tenancy ----

    @Test
    @DisplayName("one organization never sees or revokes another's invitations")
    void invitationsAreScopedToTheCallersOrganization() throws Exception {
        String emailA = uniqueEmail("admin-a");
        registerAdmin(uniqueName("Org A"), emailA, PASSWORD);
        String tokenA = loginForAccessToken(emailA, PASSWORD);

        String emailB = uniqueEmail("admin-b");
        registerAdmin(uniqueName("Org B"), emailB, PASSWORD);
        String tokenB = loginForAccessToken(emailB, PASSWORD);

        JsonNode inviteB = inviteEmployee(tokenB, uniqueEmail("employee-b"));

        // A's listing contains nothing of B's.
        assertThat(listInvites(tokenA)).isEmpty();

        // And A cannot revoke B's invitation: it does not exist, as far as A is
        // concerned. 404 rather than 403, so the response cannot confirm that
        // the identifier is real.
        mockMvc.perform(delete(INVITES + "/" + inviteB.get("inviteId").asText())
                .header(HttpHeaders.AUTHORIZATION, bearer(tokenA)))
            .andExpect(status().isNotFound());

        assertThat(inviteTokenRepository
            .findById(UUID.fromString(inviteB.get("inviteId").asText()))
            .orElseThrow().isActive()).isTrue();
    }

    // ---- authorisation ----

    @Test
    @DisplayName("an employee cannot reach any invitation endpoint")
    void employeeReceives403OnInviteEndpoints() throws Exception {
        String adminEmail = uniqueEmail("admin");
        registerAdmin(uniqueName("Org"), adminEmail, PASSWORD);
        String adminToken = loginForAccessToken(adminEmail, PASSWORD);

        String employeeEmail = uniqueEmail("employee");
        inviteAndRegisterEmployee(adminToken, employeeEmail, PASSWORD);
        String employeeToken = loginForAccessToken(employeeEmail, PASSWORD);

        mockMvc.perform(get(INVITES)
                .header(HttpHeaders.AUTHORIZATION, bearer(employeeToken)))
            .andExpect(status().isForbidden());

        mockMvc.perform(post(INVITES)
                .header(HttpHeaders.AUTHORIZATION, bearer(employeeToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("email", uniqueEmail("x")))))
            .andExpect(status().isForbidden());

        mockMvc.perform(delete(INVITES + "/" + UUID.randomUUID())
                .header(HttpHeaders.AUTHORIZATION, bearer(employeeToken)))
            .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("a project manager who is not an organization admin cannot invite")
    void nonOrgAdminManagerReceives403() throws Exception {
        Organization organization = organizationRepository.save(
            new Organization(uniqueName("Org"), "Addr"));
        String managerEmail = uniqueEmail("manager");
        User manager = userRepository.save(new User(
            organization, "Manager", managerEmail, passwordEncoder.encode(PASSWORD)));
        userRoleRepository.save(new UserRole(manager, AccessRole.EMPLOYEE));
        userRoleRepository.save(new UserRole(manager, AccessRole.PROJECT_MANAGER));

        String managerToken = loginForAccessToken(managerEmail, PASSWORD);

        mockMvc.perform(post(INVITES)
                .header(HttpHeaders.AUTHORIZATION, bearer(managerToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("email", uniqueEmail("x")))))
            .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("a system admin has no current organization to invite into")
    void systemAdminWithoutOrganizationCannotUseCurrentOrganizationRoute() throws Exception {
        String token = systemAdminAccessToken();

        mockMvc.perform(get(INVITES)
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isBadRequest());
    }

    // ---- helpers ----

    private JsonNode listInvites(String accessToken) throws Exception {
        return objectMapper.readTree(mockMvc.perform(get(INVITES)
                .header(HttpHeaders.AUTHORIZATION, bearer(accessToken)))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString());
    }

    private InviteToken inviteByRawToken(String rawToken) {
        return inviteTokenRepository
            .findByTokenHash(TokenDigest.sha256Base64Url(rawToken))
            .orElseThrow();
    }
}
