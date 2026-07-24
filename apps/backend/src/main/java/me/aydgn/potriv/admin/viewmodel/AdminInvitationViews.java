package me.aydgn.potriv.admin.viewmodel;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Invitation read models. The raw invite token value is never included — only
 * a masked hint and derived status.
 */
public final class AdminInvitationViews {

    private AdminInvitationViews() {
    }

    public record ListItem(
        UUID id,
        String organizationName,
        String tokenHint,
        String status,
        OffsetDateTime createdAt,
        OffsetDateTime expiresAt
    ) {
    }

    public record Details(
        UUID id,
        String organizationName,
        UUID organizationId,
        String tokenHint,
        String status,
        boolean active,
        boolean expired,
        OffsetDateTime createdAt,
        OffsetDateTime expiresAt,
        OffsetDateTime updatedAt
    ) {
    }
}
