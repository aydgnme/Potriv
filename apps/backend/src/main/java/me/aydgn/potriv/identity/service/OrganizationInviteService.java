package me.aydgn.potriv.identity.service;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.common.exception.BadRequestException;
import me.aydgn.potriv.common.exception.NotFoundException;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.identity.dto.EmployeeInviteResponse;
import me.aydgn.potriv.identity.entity.InviteToken;
import me.aydgn.potriv.identity.repository.InviteTokenRepository;
import me.aydgn.potriv.organization.entity.Organization;
import me.aydgn.potriv.organization.repository.OrganizationRepository;

@Service
public class OrganizationInviteService {

    private final InviteTokenRepository inviteTokenRepository;
    private final OrganizationRepository organizationRepository;
    private final InviteTokenService inviteTokenService;

    public OrganizationInviteService(
        InviteTokenRepository inviteTokenRepository,
        OrganizationRepository organizationRepository,
        InviteTokenService inviteTokenService
    ) {
        this.inviteTokenRepository = inviteTokenRepository;
        this.organizationRepository = organizationRepository;
        this.inviteTokenService = inviteTokenService;
    }

    @Transactional(readOnly = true)
    public EmployeeInviteResponse getCurrentInvite(AuthenticatedUser currentUser) {
        Organization organization = organizationRepository
            .findById(requireOrganizationId(currentUser))
            .orElseThrow(() -> new NotFoundException("Organization was not found."));

        InviteToken invite = inviteTokenRepository
            .findFirstByOrganizationAndActiveTrueOrderByCreatedAtDesc(organization)
            .orElseThrow(() -> new NotFoundException("No active employee invite was found."));

        return toResponse(invite);
    }

    @Transactional
    public EmployeeInviteResponse rotateInvite(AuthenticatedUser currentUser) {
        // The pessimistic organization lock serializes concurrent rotations so
        // at most one active invite remains after the transaction completes.
        Organization organization = organizationRepository
            .findByIdForUpdate(requireOrganizationId(currentUser))
            .orElseThrow(() -> new NotFoundException("Organization was not found."));

        inviteTokenRepository
            .findAllByOrganizationAndActiveTrue(organization)
            .forEach(InviteToken::deactivate);

        InviteToken newInvite = inviteTokenService.createForOrganization(organization);

        return toResponse(newInvite);
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
            inviteTokenService.buildInviteUrl(invite),
            invite.isActive(),
            invite.getCreatedAt(),
            invite.getExpiresAt()
        );
    }
}
