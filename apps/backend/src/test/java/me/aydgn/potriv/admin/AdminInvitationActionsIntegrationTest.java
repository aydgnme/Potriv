package me.aydgn.potriv.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.identity.entity.InviteToken;
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

    /** A freshly registered organization plus its invite link and raw token. */
    private record Seed(UUID organizationId, UUID invitationId, String rawToken) {
    }

    private Seed seed() throws Exception {
        JsonNode admin = registerAdmin(uniqueName("InviteOrg"), uniqueEmail("inviteorg"),
            "Password123!");
        UUID organizationId = UUID.fromString(admin.get("organizationId").asText());
        String rawToken = extractInviteToken(admin.get("employeeInviteUrl").asText());
        UUID invitationId = inviteTokenRepository.findByToken(rawToken).orElseThrow().getId();
        return new Seed(organizationId, invitationId, rawToken);
    }

    private InviteToken reload(UUID invitationId) {
        return inviteTokenRepository.findById(invitationId).orElseThrow();
    }

    private InviteToken activeInviteOf(UUID organizationId) {
        Organization organization = organizationRepository.findById(organizationId).orElseThrow();
        return inviteTokenRepository
            .findFirstByOrganizationAndActiveTrueOrderByCreatedAtDesc(organization)
            .orElseThrow();
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
     * The link is shared, so "already used" is not a state it can be in. What must
     * hold instead is that revoking never reaches back into accounts that were
     * created with it.
     */
    @Test
    void revokeDoesNotAffectEmployeesAlreadyRegisteredWithTheLink() throws Exception {
        Seed seed = seed();
        String employeeEmail = uniqueEmail("joined");
        registerEmployee(seed.rawToken(), employeeEmail, "Password123!");

        revoke(seed.invitationId());

        assertThat(userRepository.findByEmail(employeeEmail)).isPresent();
        assertThat(userRepository.findByEmail(employeeEmail).orElseThrow().isActive()).isTrue();
        // ...and they can still authenticate.
        assertThat(login(employeeEmail, "Password123!").get("accessToken").asText()).isNotBlank();
    }

    // --------------------------------------------------------- Regenerate

    @Test
    void regenerateDisablesTheOldLinkAndIssuesAWorkingReplacement() throws Exception {
        Seed seed = seed();

        regenerate(seed.invitationId());

        assertThat(reload(seed.invitationId()).isActive()).isFalse();

        InviteToken replacement = activeInviteOf(seed.organizationId());
        assertThat(replacement.getId()).isNotEqualTo(seed.invitationId());
        assertThat(replacement.isUsable()).isTrue();

        // The old link is dead...
        mockMvc.perform(post("/auth/register-employee/" + seed.rawToken())
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(java.util.Map.of(
                    "name", "Old Link",
                    "email", uniqueEmail("oldlink"),
                    "password", "Password123!"))))
            .andExpect(status().isBadRequest());
        // ...and the replacement works.
        registerEmployee(replacement.getToken(), uniqueEmail("newlink"), "Password123!");
        assertThat(audited(SecurityAuditEventType.ADMIN_INVITATION_REGENERATED)).isTrue();
    }

    @Test
    void regenerateLeavesExactlyOneActiveInvitationForTheOrganization() throws Exception {
        Seed seed = seed();

        regenerate(seed.invitationId());
        regenerate(activeInviteOf(seed.organizationId()).getId());

        Organization organization = organizationRepository.findById(seed.organizationId())
            .orElseThrow();
        assertThat(inviteTokenRepository.findAllByOrganizationAndActiveTrue(organization))
            .hasSize(1);
    }

    @Test
    void actionsOnOneOrganizationDoNotTouchAnother() throws Exception {
        Seed first = seed();
        Seed second = seed();

        regenerate(first.invitationId());
        revoke(second.invitationId());

        // The second organization keeps exactly the state its own action produced.
        assertThat(reload(second.invitationId()).isActive()).isFalse();
        // The first organization got a replacement; the second did not.
        Organization secondOrganization = organizationRepository
            .findById(second.organizationId()).orElseThrow();
        assertThat(inviteTokenRepository.findAllByOrganizationAndActiveTrue(secondOrganization))
            .isEmpty();
        assertThat(activeInviteOf(first.organizationId()).getId())
            .isNotEqualTo(first.invitationId());
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
        String replacedToken;

        revoke(seed.invitationId());
        regenerate(seed.invitationId());
        replacedToken = activeInviteOf(seed.organizationId()).getToken();

        assertThat(auditEventRepository.findAll())
            .filteredOn(event -> event.getDetails() != null)
            .allSatisfy(event -> {
                assertThat(event.getDetails()).doesNotContain(seed.rawToken());
                assertThat(event.getDetails()).doesNotContain(replacedToken);
            });
    }
}
