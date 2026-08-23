package me.aydgn.potriv.identity.service;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.common.exception.BadRequestException;
import me.aydgn.potriv.common.exception.NotFoundException;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.identity.dto.EmployeeInviteResponse;
import me.aydgn.potriv.identity.entity.InviteToken;
import me.aydgn.potriv.identity.repository.InviteTokenRepository;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.organization.entity.Organization;
import me.aydgn.potriv.organization.repository.OrganizationRepository;
import me.aydgn.potriv.security.entity.SecurityAuditEvent;
import me.aydgn.potriv.security.entity.SecurityAuditEventType;
import me.aydgn.potriv.security.service.SecurityAuditService;

/**
 * Employee invites, one per person.
 *
 * An invite names the address it was issued to and can be redeemed only by
 * that address, exactly once.
 *
 * The raw token never leaves this class. It is generated, written into one
 * email, and dropped; the store holds a SHA-256 and every response carries
 * metadata only. An administrator's browser therefore never holds a credential
 * it could leak through a screenshot, a copied URL or a browser extension.
 */
@Service
public class OrganizationInviteService {

    private final InviteTokenRepository inviteTokenRepository;
    private final OrganizationRepository organizationRepository;
    private final UserRepository userRepository;
    private final InviteTokenService inviteTokenService;
    private final InviteUrlFactory inviteUrlFactory;
    private final EmployeeInviteMailService inviteMailService;
    private final SecurityAuditService securityAuditService;

    public OrganizationInviteService(
        InviteTokenRepository inviteTokenRepository,
        OrganizationRepository organizationRepository,
        UserRepository userRepository,
        InviteTokenService inviteTokenService,
        InviteUrlFactory inviteUrlFactory,
        EmployeeInviteMailService inviteMailService,
        SecurityAuditService securityAuditService
    ) {
        this.inviteTokenRepository = inviteTokenRepository;
        this.organizationRepository = organizationRepository;
        this.userRepository = userRepository;
        this.inviteTokenService = inviteTokenService;
        this.inviteUrlFactory = inviteUrlFactory;
        this.inviteMailService = inviteMailService;
        this.securityAuditService = securityAuditService;
    }

    /** Every invite this organization has issued. Metadata only. */
    @Transactional(readOnly = true)
    public List<EmployeeInviteResponse> listInvites(AuthenticatedUser currentUser) {
        Organization organization = requireOrganization(currentUser);

        return inviteTokenRepository.findAllByOrganizationOrderByCreatedAtDesc(organization)
            .stream()
            .map(this::toResponse)
            .toList();
    }

    /**
     * Invites one person.
     *
     * Any invite this organization already has outstanding for the same address
     * is revoked first, so a person never holds two live links and re-inviting
     * somebody invalidates the earlier mail.
     *
     * The link is sent by this server to that address. It is not returned:
     * handing the administrator a working credential for somebody else's
     * account is the thing this design is avoiding.
     */
    @Transactional
    public EmployeeInviteResponse inviteEmployee(AuthenticatedUser currentUser, String email) {
        Organization organization = organizationRepository
            .findByIdForUpdate(requireOrganizationId(currentUser))
            .orElseThrow(() -> new NotFoundException("Organization was not found."));

        String normalizedEmail = InviteTokenService.normalizeEmail(email);

        /*
          Deliberately no "this address already has an account" branch.

          It answered 400 for an address registered anywhere in the system and
          201 for one that was not, which turned an organization-admin endpoint
          into a global account oracle: any administrator of any tenant could
          test whether a person had a Potriv account at all, one address at a
          time, and the answer was authoritative.

          Every address now gets the same treatment — an invitation is created,
          listed, and mailed — and an address that already has an account fails
          at redemption instead, with the one generic error every other dead
          invitation produces. Nothing about the outcome differs before that
          point: not the status, not the body, not the admin list, not whether
          mail was sent.

          The audit record below keeps the real state internally, because an
          administrator investigating an incident does need to know.
        */
        boolean addressAlreadyRegistered = userRepository.existsByEmail(normalizedEmail);

        // Outstanding only. Sweeping every `active` row would reach a spent
        // invitation and stamp `revokedAt` onto somebody's completed
        // registration.
        inviteTokenRepository
            .findPendingFor(organization, normalizedEmail)
            .forEach(InviteToken::deactivate);

        /*
          The intention only. No token is minted here and no mail is sent, so
          this transaction cannot fail for a reason outside the database — and
          the organization lock it holds is released in milliseconds rather
          than being held open for the length of an SMTP timeout.
        */
        InviteToken queued = inviteTokenService.queueFor(organization, normalizedEmail);

        securityAuditService.record(
            SecurityAuditEvent.builder(
                    SecurityAuditEventType.EMPLOYEE_INVITE_ISSUED, true)
                .userId(currentUser.userId())
                .organizationId(organization.getId())
                .actorUserId(currentUser.userId())
                .normalizedEmail(normalizedEmail)
                // The invite's id, never its value. The account-exists flag is
                // recorded here and nowhere the caller can see, which is the
                // whole point of moving it out of the response.
                .details("Employee invite queued. Invite ID: " + queued.getId()
                    + ". Address already registered: " + addressAlreadyRegistered + ".")
                .build()
        );

        return toResponse(queued);
    }

    @Transactional
    public void revokeInvite(AuthenticatedUser currentUser, UUID inviteId) {
        Organization organization = requireOrganization(currentUser);

        InviteToken invite = inviteTokenRepository.findById(inviteId)
            .filter(candidate -> candidate.getOrganization().getId().equals(organization.getId()))
            // Anti-leak: another organization's invite is indistinguishable
            // from one that does not exist.
            .orElseThrow(() -> new NotFoundException("Invitation was not found."));

        invite.deactivate();

        securityAuditService.record(
            SecurityAuditEvent.builder(
                    SecurityAuditEventType.EMPLOYEE_INVITE_REVOKED, true)
                .userId(currentUser.userId())
                .organizationId(organization.getId())
                .actorUserId(currentUser.userId())
                .details("Employee invite revoked. Invite ID: " + invite.getId() + ".")
                .build()
        );
    }

    private Organization requireOrganization(AuthenticatedUser currentUser) {
        return organizationRepository
            .findById(requireOrganizationId(currentUser))
            .orElseThrow(() -> new NotFoundException("Organization was not found."));
    }

    private UUID requireOrganizationId(AuthenticatedUser currentUser) {
        if (currentUser.organizationId() == null) {
            throw new BadRequestException("Authenticated user does not belong to an organization.");
        }
        return currentUser.organizationId();
    }

    private EmployeeInviteResponse toResponse(InviteToken invite) {
        return new EmployeeInviteResponse(
            invite.getId(),
            EmployeeInviteResponse.mask(invite.getInvitedEmail()),
            statusOf(invite),
            EmployeeInviteResponse.DeliveryStatus.valueOf(invite.getDeliveryStatus().name()),
            invite.getCreatedAt(),
            invite.getExpiresAt()
        );
    }

    /**
     * One derivation, on the entity. This used to be spelled out here and
     * spelled out differently in the admin console, which is how the two came
     * to disagree about a spent invitation.
     */
    private static EmployeeInviteResponse.InviteStatus statusOf(InviteToken invite) {
        return EmployeeInviteResponse.InviteStatus.valueOf(invite.status().name());
    }
}
