package me.aydgn.potriv.admin.service;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.admin.security.AdminPrincipal;
import me.aydgn.potriv.admin.support.AdminNotFoundException;
import me.aydgn.potriv.identity.entity.InviteToken;
import me.aydgn.potriv.identity.repository.InviteTokenRepository;
import me.aydgn.potriv.identity.service.InviteTokenService;
import me.aydgn.potriv.organization.entity.Organization;
import me.aydgn.potriv.organization.repository.OrganizationRepository;
import me.aydgn.potriv.security.entity.SecurityAuditEvent;
import me.aydgn.potriv.security.entity.SecurityAuditEventType;
import me.aydgn.potriv.security.service.SecurityAuditService;

/**
 * Transactional write service for invitation administration.
 *
 * <p>A Potriv invitation is an <em>organization-wide join link</em>, not a
 * per-recipient record: {@link InviteToken} has a token, an optional expiry and
 * an {@code active} flag, and any number of employees can register with the same
 * link while it is usable. The safe administrative actions therefore are
 * "disable this link" and "replace it with a fresh one" — the console never
 * needs, and never gets, the raw token to do either.
 */
@Service
public class AdminInvitationWriteService {

    /** Outcome of an invitation action, mapped by the controller to a flash message. */
    public record InvitationActionOutcome(Kind kind, String message) {
        public enum Kind { SUCCESS, INFO }

        static InvitationActionOutcome success(String message) {
            return new InvitationActionOutcome(Kind.SUCCESS, message);
        }

        static InvitationActionOutcome info(String message) {
            return new InvitationActionOutcome(Kind.INFO, message);
        }
    }

    private final InviteTokenRepository inviteTokenRepository;
    private final OrganizationRepository organizationRepository;
    private final InviteTokenService inviteTokenService;
    private final SecurityAuditService securityAuditService;

    public AdminInvitationWriteService(
        InviteTokenRepository inviteTokenRepository,
        OrganizationRepository organizationRepository,
        InviteTokenService inviteTokenService,
        SecurityAuditService securityAuditService
    ) {
        this.inviteTokenRepository = inviteTokenRepository;
        this.organizationRepository = organizationRepository;
        this.inviteTokenService = inviteTokenService;
        this.securityAuditService = securityAuditService;
    }

    /**
     * Permanently disables an invite link. Idempotent: revoking an already
     * disabled invitation reports that and changes nothing.
     */
    @Transactional
    public InvitationActionOutcome revoke(UUID invitationId, AdminPrincipal actor) {
        InviteToken invite = requireInvitation(invitationId);

        if (!invite.isActive()) {
            return InvitationActionOutcome.info("Invitation is already disabled.");
        }
        invite.deactivate();

        audit(SecurityAuditEventType.ADMIN_INVITATION_REVOKED, invite, actor,
            "Revoked invitation " + invite.getId());
        return InvitationActionOutcome.success(
            "Invitation revoked. The link can no longer be used to register.");
    }

    /**
     * Replaces the organization's invite link: every active invitation for that
     * organization is disabled and one fresh invitation is created.
     *
     * <p>This mirrors the invariant the organization-admin rotation keeps — at
     * most one active invite per organization — and takes the same pessimistic
     * organization lock so concurrent regenerations cannot both create one.
     *
     * <p>The new token is deliberately <strong>not</strong> returned or rendered:
     * the console's job is to invalidate a leaked link, and the organization
     * retrieves the new URL through the product's own invite endpoint.
     */
    @Transactional
    public InvitationActionOutcome regenerate(UUID invitationId, AdminPrincipal actor) {
        InviteToken invite = requireInvitation(invitationId);

        Organization organization = organizationRepository
            .findByIdForUpdate(invite.getOrganization().getId())
            .orElseThrow(() -> new AdminNotFoundException("Organization was not found."));

        inviteTokenRepository.findAllByOrganizationAndActiveTrue(organization)
            .forEach(InviteToken::deactivate);
        InviteToken replacement = inviteTokenService.createForOrganization(organization);

        // The replacement's id is safe to record; its token is not.
        audit(SecurityAuditEventType.ADMIN_INVITATION_REGENERATED, invite, actor,
            "Regenerated organization invite. New invitation ID: " + replacement.getId());
        return InvitationActionOutcome.success(
            "A new invitation was created and every previous link for this organization"
                + " was disabled. The new link is available through the organization's"
                + " own invite endpoint — it is never shown here.");
    }

    private InviteToken requireInvitation(UUID invitationId) {
        return inviteTokenRepository.findById(invitationId)
            .orElseThrow(() -> new AdminNotFoundException("Invitation was not found."));
    }

    private void audit(
        SecurityAuditEventType type, InviteToken invite, AdminPrincipal actor, String details) {
        securityAuditService.record(SecurityAuditEvent.builder(type, true)
            .actorUserId(actor == null ? null : actor.userId())
            .organizationId(invite.getOrganization().getId())
            .details(details)
            .build());
    }
}
