package me.aydgn.potriv.admin.service;

import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.admin.repository.AdminInvitationRepository;
import me.aydgn.potriv.admin.support.AdminListView;
import me.aydgn.potriv.admin.support.AdminNotFoundException;
import me.aydgn.potriv.admin.support.AdminPaging;
import me.aydgn.potriv.admin.viewmodel.AdminInvitationViews;
import me.aydgn.potriv.identity.dto.EmployeeInviteResponse;
import me.aydgn.potriv.identity.entity.InviteToken;

@Service
public class AdminInvitationService {


    private final AdminInvitationRepository invitationRepository;

    public AdminInvitationService(AdminInvitationRepository invitationRepository) {
        this.invitationRepository = invitationRepository;
    }

    @Transactional(readOnly = true)
    public AdminListView<AdminInvitationViews.ListItem> list(
        String query, Pageable pageable, String baseQuery) {
        String q = AdminPaging.normalizeQuery(query);
        Page<InviteToken> page = invitationRepository.search(AdminPaging.likePattern(q), pageable);

        Page<AdminInvitationViews.ListItem> mapped = page.map(invite ->
            new AdminInvitationViews.ListItem(
                invite.getId(),
                invite.getOrganization().getName(),
                EmployeeInviteResponse.mask(invite.getInvitedEmail()),
                status(invite),
                invite.getCreatedAt(),
                invite.getExpiresAt()));
        return AdminListView.of(mapped, q, baseQuery);
    }

    @Transactional(readOnly = true)
    public AdminInvitationViews.Details details(UUID id) {
        InviteToken invite = invitationRepository.findDetailById(id)
            .orElseThrow(() -> new AdminNotFoundException("Invitation was not found."));
        return new AdminInvitationViews.Details(
            invite.getId(),
            invite.getOrganization().getName(),
            invite.getOrganization().getId(),
            EmployeeInviteResponse.mask(invite.getInvitedEmail()),
            status(invite),
            invite.getDeliveryStatus().name(),
            invite.getAttemptCount(),
            invite.getLastError(),
            invite.isPending(),
            invite.getCreatedAt(),
            invite.getExpiresAt(),
            invite.getConsumedAt(),
            invite.getRevokedAt(),
            invite.getUpdatedAt());
    }

    /**
     * The same four states the product uses, derived in the same place.
     *
     * This function used to answer ACTIVE / EXPIRED / DISABLED from
     * {@code active} and {@code expiresAt} alone. It had no notion of a spent
     * invitation, so one that somebody had already accepted was displayed as
     * ACTIVE and counted as outstanding.
     */
    private static String status(InviteToken invite) {
        return invite.status().name();
    }
}
