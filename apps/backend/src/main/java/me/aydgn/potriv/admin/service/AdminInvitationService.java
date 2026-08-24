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
     * The same four states the product uses, derived in the same place — with
     * one admin-console-only refinement.
     *
     * {@link InviteToken#status()} answers REVOKED for {@code active == false}
     * regardless of why: an administrator withdrawing the invitation is one
     * way to reach that, and exhausting every delivery attempt —
     * {@link InviteToken#markDeliveryFailed} — is the other, and the entity
     * does not distinguish them because the product's own contract
     * ({@code EmployeeInviteResponse.InviteStatus}) has no fifth state for it.
     * Collapsing the two is fine for that contract; it is actively misleading
     * on this page, which shows an admin the invitation's {@code revokedAt}
     * timestamp — null for the second case — directly under a badge reading
     * "REVOKED" that says withdrawn happened.
     *
     * So here, and only here: a row that reports REVOKED but was never
     * actually withdrawn is relabelled DELIVERY_FAILED. Nothing about the
     * entity's own state changes, and every other caller of
     * {@link InviteToken#status()} — the product API included — is unaffected.
     */
    private static String status(InviteToken invite) {
        InviteToken.Status status = invite.status();
        if (status == InviteToken.Status.REVOKED && invite.getRevokedAt() == null) {
            return "DELIVERY_FAILED";
        }
        return status.name();
    }
}
