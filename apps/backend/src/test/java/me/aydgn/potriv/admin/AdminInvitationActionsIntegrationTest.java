package me.aydgn.potriv.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.identity.entity.InviteToken;
import me.aydgn.potriv.common.security.TokenDigest;
import me.aydgn.potriv.identity.repository.InviteTokenRepository;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.organization.entity.Organization;
import me.aydgn.potriv.organization.repository.OrganizationRepository;
import me.aydgn.potriv.security.entity.SecurityAuditEventType;
import me.aydgn.potriv.security.repository.SecurityAuditEventRepository;

/**
 * Invitation administration actions.
 *
 * <p>A Potriv invitation is an organization-wide join link — there is no
 * recipient address and no "used" state — so the meaningful admin actions are
 * revoking a link and replacing it. These tests exercise that model rather than
 * a per-recipient one.
 */
class AdminInvitationActionsIntegrationTest extends AbstractAdminIntegrationTest {

    @Autowired
    private InviteTokenRepository inviteTokenRepository;
    @Autowired
    private OrganizationRepository organizationRepository;
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private SecurityAuditEventRepository auditEventRepository;

    /** An organization with one outstanding invitation, addressed to one person. */
    private record Seed(UUID organizationId, UUID invitationId, String invitedEmail,
                        String rawToken) {
    }

    private Seed seed() throws Exception {
        String adminEmail = uniqueEmail("inviteorg");
        JsonNode admin = registerAdmin(uniqueName("InviteOrg"), adminEmail, "Password123!");
        UUID organizationId = UUID.fromString(admin.get("organizationId").asText());
        String adminToken = loginForAccessToken(adminEmail, "Password123!");

        // The raw token is not in the invite response by design, so the test
        // reads it the way the recipient would: out of the mail that was sent.
        String invitedEmail = uniqueEmail("invitee");
        inviteEmployee(adminToken, invitedEmail);
        String rawToken = inviteTokenFromMailTo(invitedEmail);

        UUID invitationId = inviteTokenRepository
            .findByTokenHash(TokenDigest.sha256Base64Url(rawToken)).orElseThrow().getId();
        return new Seed(organizationId, invitationId, invitedEmail, rawToken);
    }

    private InviteToken reload(UUID invitationId) {
        return inviteTokenRepository.findById(invitationId).orElseThrow();
    }

    /**
     * The organization's single outstanding invitation. Callers use this only
     * on organizations they seeded with exactly one, and the assertion below
     * makes that assumption fail loudly rather than pick an arbitrary row.
     */
    private InviteToken activeInviteOf(UUID organizationId) {
        Organization organization = organizationRepository.findById(organizationId).orElseThrow();
        List<InviteToken> active = inviteTokenRepository
            .findAllByOrganizationAndActiveTrue(organization);
        assertThat(active).hasSize(1);
        return active.get(0);
    }

    private boolean audited(SecurityAuditEventType type) {
        return auditEventRepository.findAll().stream().anyMatch(e -> e.getEventType() == type);
    }

    private void revoke(UUID invitationId) throws Exception {
        mockMvc.perform(post("/admin/invitations/" + invitationId + "/revoke")
                .with(csrf()).session(adminSession()))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrl("/admin/invitations/" + invitationId));
    }

    private void regenerate(UUID invitationId) throws Exception {
        mockMvc.perform(post("/admin/invitations/" + invitationId + "/regenerate")
                .with(csrf()).session(adminSession()))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrl("/admin/invitations/" + invitationId));
    }

    // ------------------------------------------------------------- Access

    @Test
    void anonymousCannotViewOrActOnInvitations() throws Exception {
        Seed seed = seed();

        mockMvc.perform(get("/admin/invitations/" + seed.invitationId()))
            .andExpect(status().is3xxRedirection());
        mockMvc.perform(post("/admin/invitations/" + seed.invitationId() + "/revoke").with(csrf()))
            .andExpect(status().is3xxRedirection());

        assertThat(reload(seed.invitationId()).isActive()).isTrue();
    }

    @Test
    void systemAdminCanViewInvitationAdministration() throws Exception {
        Seed seed = seed();
        String html = adminGet("/admin/invitations/" + seed.invitationId())
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(html).contains("Revoke", "Regenerate");
    }

    @Test
    void postActionsRequireCsrf() throws Exception {
        Seed seed = seed();

        mockMvc.perform(post("/admin/invitations/" + seed.invitationId() + "/revoke")
                .session(adminSession()))
            .andExpect(status().isForbidden());
        mockMvc.perform(post("/admin/invitations/" + seed.invitationId() + "/regenerate")
                .session(adminSession()))
            .andExpect(status().isForbidden());

        assertThat(reload(seed.invitationId()).isActive()).isTrue();
    }

    @Test
    void viewingTheDetailPageDoesNotMutateState() throws Exception {
        Seed seed = seed();

        adminGet("/admin/invitations/" + seed.invitationId()).andExpect(status().isOk());
        adminGet("/admin/invitations/" + seed.invitationId()).andExpect(status().isOk());

        assertThat(reload(seed.invitationId()).isActive()).isTrue();
        assertThat(activeInviteOf(seed.organizationId()).getId()).isEqualTo(seed.invitationId());
    }

    @Test
    void unknownInvitationReturns404() throws Exception {
        adminGet("/admin/invitations/" + UUID.randomUUID()).andExpect(status().isNotFound());
    }

    // ------------------------------------------------------------- Revoke

    @Test
    void revokeDisablesTheLinkAndBlocksRegistration() throws Exception {
        Seed seed = seed();

        revoke(seed.invitationId());

        assertThat(reload(seed.invitationId()).isActive()).isFalse();
        assertThat(reload(seed.invitationId()).isUsable()).isFalse();
        // The revoked link can no longer be used to join the organization.
        mockMvc.perform(post("/auth/register-employee/" + seed.rawToken())
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(java.util.Map.of(
                    "name", "Blocked Employee",
                    "email", uniqueEmail("blocked"),
                    "password", "Password123!"))))
            .andExpect(status().isBadRequest());
        assertThat(audited(SecurityAuditEventType.ADMIN_INVITATION_REVOKED)).isTrue();
    }

    @Test
    void repeatedRevokeIsSafeAndDeterministic() throws Exception {
        Seed seed = seed();

        revoke(seed.invitationId());
        revoke(seed.invitationId());

        assertThat(reload(seed.invitationId()).isActive()).isFalse();
    }

    /**
     * Revoking is about the invitation, not about the person. Once someone has
     * redeemed theirs, revoking the spent record must not reach back into the
     * account it created.
     */
    @Test
    void revokeDoesNotAffectAnEmployeeWhoAlreadyRegistered() throws Exception {
        Seed seed = seed();
        String employeeEmail = seed.invitedEmail();
        registerEmployee(seed.rawToken(), employeeEmail, "Password123!");

        revoke(seed.invitationId());

        assertThat(userRepository.findByEmail(employeeEmail)).isPresent();
        assertThat(userRepository.findByEmail(employeeEmail).orElseThrow().isActive()).isTrue();
        // ...and they can still authenticate.
        assertThat(login(employeeEmail, "Password123!").get("accessToken").asText()).isNotBlank();
    }

    // --------------------------------------------------------- Regenerate

    @Test
    void regenerateRevokesEveryActiveInviteAndKillsTheOldLink() throws Exception {
        /*
          The console used to mint a replacement here. It no longer can:
          invites are stored as a hash, so a link exists only in the response
          that creates it, and a replacement made from this screen could not be
          shown here or anywhere else. The action revokes; the organization
          admin rotates through their own endpoint to get a working link.
        */
        Seed seed = seed();

        regenerate(seed.invitationId());

        assertThat(reload(seed.invitationId()).isActive()).isFalse();
        assertThat(inviteTokenRepository
            .findAllByOrganizationAndActiveTrue(
                reload(seed.invitationId()).getOrganization()))
            .isEmpty();

        // The old link is dead, and says nothing about why.
        mockMvc.perform(post("/auth/register-employee/" + seed.rawToken())
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(java.util.Map.of(
                    "name", "Old Link",
                    "email", uniqueEmail("oldlink"),
                    "password", "Password123!"))))
            .andExpect(status().isBadRequest());

        assertThat(audited(SecurityAuditEventType.ADMIN_INVITATION_REGENERATED)).isTrue();
    }

    @Test
    void regenerateLeavesNoActiveInvitationForTheOrganization() throws Exception {
        /*
          There is nothing for the console to replace the invitation with. A new
          one has to be addressed to a person and mailed to them, which is the
          organization admin's action, not a system administrator's. So this
          ends at zero rather than at one, and the organization admin invites
          the person again.
        */
        Seed seed = seed();

        regenerate(seed.invitationId());

        Organization organization = organizationRepository.findById(seed.organizationId())
            .orElseThrow();
        assertThat(inviteTokenRepository.findAllByOrganizationAndActiveTrue(organization))
            .isEmpty();
    }

    @Test
    void actionsOnOneOrganizationDoNotTouchAnother() throws Exception {
        Seed first = seed();
        Seed second = seed();

        regenerate(first.invitationId());

        // The first organization's invitation is gone...
        assertThat(reload(first.invitationId()).isActive()).isFalse();
        Organization firstOrganization = organizationRepository
            .findById(first.organizationId()).orElseThrow();
        assertThat(inviteTokenRepository.findAllByOrganizationAndActiveTrue(firstOrganization))
            .isEmpty();

        // ...and the second organization is untouched by it.
        assertThat(reload(second.invitationId()).isActive()).isTrue();
        assertThat(activeInviteOf(second.organizationId()).getId())
            .isEqualTo(second.invitationId());
    }

    // ----------------------------------------------------- Token secrecy

    @Test
    void rawTokenNeverAppearsInAdminPages() throws Exception {
        Seed seed = seed();

        String detail = adminGet("/admin/invitations/" + seed.invitationId())
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        String list = adminGet("/admin/invitations")
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();

        assertThat(detail).doesNotContain(seed.rawToken());
        assertThat(list).doesNotContain(seed.rawToken());
        assertThat(detail).contains("(hidden)");
    }

    @Test
    void rawTokenNeverAppearsInAuditDetails() throws Exception {
        Seed seed = seed();

        revoke(seed.invitationId());
        regenerate(seed.invitationId());

        /*
          Two assertions, because the first alone would pass a regression that
          logged a *different* token. The second rejects anything shaped like
          one: 43 characters of base64url is what a 32-byte token encodes to,
          and no legitimate audit detail on these events contains such a run.
        */
        assertThat(auditEventRepository.findAll())
            .filteredOn(event -> event.getDetails() != null)
            .allSatisfy(event -> {
                assertThat(event.getDetails()).doesNotContain(seed.rawToken());
                assertThat(event.getDetails())
                    .withFailMessage("audit detail carries a token-shaped value: %s",
                        event.getDetails())
                    .doesNotMatch(".*[A-Za-z0-9_-]{43}.*");
            });
    }
}
