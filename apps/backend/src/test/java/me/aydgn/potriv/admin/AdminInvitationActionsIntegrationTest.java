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
 * <p>A Potriv invitation is addressed to one person and redeems once: it
 * carries {@code invitedEmail} and is consumed by exactly the registration it
 * permits. The meaningful admin actions follow from that — withdrawing one
 * invitation, and seeing its delivery and acceptance state — never a
 * shared-link model, which this schema stopped supporting when invites moved
 * from a single organization-wide token to one hashed, expiring, per-recipient
 * row each.
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
    @Autowired
    private org.springframework.jdbc.core.JdbcTemplate jdbcTemplate;

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
            .findPendingFor(organization);
        assertThat(active).hasSize(1);
        return active.get(0);
    }

    private boolean audited(SecurityAuditEventType type) {
        return auditEventRepository.findAll().stream().anyMatch(e -> e.getEventType() == type);
    }

    /**
     * Scoped to one organization.
     *
     * The audit table is shared by every test in the run, and one of them seeds
     * a legacy {@code ADMIN_INVITATION_REGENERATED} row on purpose. Asking
     * globally whether that type exists therefore answers a question about the
     * fixture rather than about the code under test.
     */
    private boolean auditedFor(SecurityAuditEventType type, UUID organizationId) {
        return auditEventRepository.findAll().stream()
            .anyMatch(e -> e.getEventType() == type
                && organizationId.equals(e.getOrganizationId()));
    }

    private void revoke(UUID invitationId) throws Exception {
        mockMvc.perform(post("/admin/invitations/" + invitationId + "/revoke")
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
        // One control, and only while the invitation can still be withdrawn.
        assertThat(html).contains("Withdraw");
        assertThat(html).doesNotContain("Regenerate");
    }

    @Test
    void postActionsRequireCsrf() throws Exception {
        Seed seed = seed();

        mockMvc.perform(post("/admin/invitations/" + seed.invitationId() + "/revoke")
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
        assertThat(reload(seed.invitationId()).isPending()).isFalse();
        // The revoked link can no longer be used to join the organization.
        mockMvc.perform(post("/auth/register-employee")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(java.util.Map.of(
                    "token", seed.rawToken(),
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
     * {@code InviteToken#status()} answers REVOKED for any inactive,
     * non-consumed invitation, whether an administrator withdrew it or
     * delivery simply exhausted every attempt — the product's own status
     * contract has no fifth state for the second case. The admin console
     * relabels that second case DELIVERY_FAILED, because the same page shows
     * {@code revokedAt}, and a null timestamp under a "REVOKED" badge tells an
     * administrator withdrawal happened when nobody withdrew anything.
     */
    @Test
    void permanentDeliveryFailureIsShownAsDeliveryFailedNotRevoked() throws Exception {
        String adminEmail = uniqueEmail("faildeliveryorg");
        registerAdmin(uniqueName("FailDeliveryOrg"), adminEmail, "Password123!");
        String adminToken = loginForAccessToken(adminEmail, "Password123!");
        String invitedEmail = uniqueEmail("neverdelivered");

        recordingMailSender.setFailing(true);
        try {
            mockMvc.perform(post("/organizations/current/invites")
                    .header(org.springframework.http.HttpHeaders.AUTHORIZATION, bearer(adminToken))
                    .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsString(
                        java.util.Map.of("email", invitedEmail))))
                .andExpect(status().isAccepted());

            UUID invitationId = inviteTokenRepository.findAll().stream()
                .filter(invite -> invite.getInvitedEmail().equals(invitedEmail))
                .findFirst().orElseThrow().getId();

            // Exhausts MAX_ATTEMPTS the same way InviteDeliveryIntegrationTest
            // does: bring the backoff forward and run the worker, repeatedly.
            for (int attempt = 0; attempt < 6; attempt++) {
                jdbcTemplate.update(
                    "update invite_tokens set next_attempt_at = ? where id = ?",
                    java.time.OffsetDateTime.now(java.time.ZoneOffset.UTC).minusMinutes(1),
                    invitationId);
                inviteDeliveryWorker.runOnce();
            }

            InviteToken failed = reload(invitationId);
            assertThat(failed.getDeliveryStatus()).isEqualTo(InviteToken.DeliveryStatus.FAILED);
            assertThat(failed.isActive()).isFalse();
            assertThat(failed.getRevokedAt())
                .as("nobody withdrew this invitation; delivery failed on its own")
                .isNull();

            String detail = adminGet("/admin/invitations/" + invitationId)
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

            assertThat(detail).contains("badge--delivery_failed");
            assertThat(detail).doesNotContain("badge--revoked");
            // The field is still on the page — and still empty, which is the
            // whole point: a populated "Withdrawn" date is what would actually
            // mean an administrator acted.
            assertThat(detail).contains("Withdrawn");
        } finally {
            recordingMailSender.setFailing(false);
        }
    }

    /** The other half of the distinction: a genuine withdrawal still reads as REVOKED. */
    @Test
    void administratorWithdrawalIsStillShownAsRevoked() throws Exception {
        Seed seed = seed();
        revoke(seed.invitationId());

        String detail = adminGet("/admin/invitations/" + seed.invitationId())
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();

        assertThat(detail).contains("badge--revoked");
        assertThat(detail).doesNotContain("badge--delivery_failed");
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

    // ------------------------------------------------- No bulk action

    @Test
    void thereIsNoRegenerateEndpointLeft() throws Exception {
        /*
          "Regenerate" disabled every active invitation for an organization and,
          once invites became hash-only, created nothing to replace them — a
          control labelled as a refresh that silently cut off everybody
          mid-registration. In a per-recipient model there is nothing
          organization-wide to regenerate, so the route is gone rather than
          renamed.
        */
        Seed seed = seed();

        mockMvc.perform(post("/admin/invitations/" + seed.invitationId() + "/regenerate")
                .with(csrf()).session(adminSession()))
            .andExpect(status().isNotFound());

        assertThat(reload(seed.invitationId()).isPending()).isTrue();
    }

    @Test
    void nothingWritesTheLegacyRegenerateAuditEvent() throws Exception {
        Seed seed = seed();

        revoke(seed.invitationId());

        // The constant stays so old rows still load; nothing emits it.
        assertThat(auditedFor(SecurityAuditEventType.ADMIN_INVITATION_REGENERATED,
            seed.organizationId())).isFalse();
        assertThat(auditedFor(SecurityAuditEventType.ADMIN_INVITATION_REVOKED,
            seed.organizationId())).isTrue();
    }

    @Test
    void withdrawingOneOrganizationsInvitationDoesNotTouchAnother() throws Exception {
        Seed first = seed();
        Seed second = seed();

        revoke(first.invitationId());

        assertThat(reload(first.invitationId()).isPending()).isFalse();
        Organization firstOrganization = organizationRepository
            .findById(first.organizationId()).orElseThrow();
        assertThat(inviteTokenRepository.findPendingFor(firstOrganization)).isEmpty();

        assertThat(reload(second.invitationId()).isPending()).isTrue();
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
        // The recipient is shown masked; the token is not shown at all.
        assertThat(detail).contains("****@");
    }

    @Test
    void rawTokenNeverAppearsInAuditDetails() throws Exception {
        Seed seed = seed();

        revoke(seed.invitationId());

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
