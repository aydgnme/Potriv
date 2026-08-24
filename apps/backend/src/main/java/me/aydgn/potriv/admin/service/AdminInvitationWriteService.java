package me.aydgn.potriv.admin.service;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.admin.security.AdminPrincipal;
import me.aydgn.potriv.admin.support.AdminNotFoundException;
import me.aydgn.potriv.identity.entity.InviteToken;
import me.aydgn.potriv.identity.repository.InviteTokenRepository;
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
    private final SecurityAuditService securityAuditService;

    public AdminInvitationWriteService(
        InviteTokenRepository inviteTokenRepository,
        SecurityAuditService securityAuditService
    ) {
        this.inviteTokenRepository = inviteTokenRepository;
        this.securityAuditService = securityAuditService;
    }

    /**
     * Withdraws one invitation, and only that one.
     *
     * There is no organization-wide action here any more. "Regenerate" used to
     * disable every active invitation for the organization and — once invites
     * became hash-only — create nothing to replace them, so a control labelled
     * as a refresh silently cut off everybody who was mid-registration. In a
     * model where an invitation is addressed to a person there is nothing
     * organization-wide left to regenerate. A bulk withdrawal is a different
     * feature, with its own name and its own confirmation, and is not smuggled
     * in behind this one.
     *
     * Idempotent: an invitation that is not outstanding reports that and
     * changes nothing.
     */
    @Transactional
    public InvitationActionOutcome revoke(UUID invitationId, AdminPrincipal actor) {
        InviteToken invite = requireInvitation(invitationId);

        if (!invite.isPending()) {
            return InvitationActionOutcome.info(
                "Invitation is not outstanding, so there is nothing to withdraw.");
        }

        invite.deactivate();

        audit(SecurityAuditEventType.ADMIN_INVITATION_REVOKED, invite, actor,
            "Revoked invitation " + invite.getId());
        return InvitationActionOutcome.success(
            "Invitation revoked. The link can no longer be used to register.");
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
