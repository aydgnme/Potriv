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
        /** Who it was sent to, masked. The full address is never rendered. */
        String maskedEmail,
        String status,
        OffsetDateTime createdAt,
        OffsetDateTime expiresAt
    ) {
    }

    /**
     * The whole life of one invitation.
     *
     * All four timestamps are present because each answers a different
     * question an administrator actually asks: when it was sent, when it
     * lapses, when the person used it, and when somebody withdrew it. A single
     * "status" word cannot answer any of them.
     *
     * `pending` is the entity's own predicate, carried here so the template
     * offers a withdrawal exactly when one would have an effect — rather than
     * re-deriving it in Thymeleaf from `active` and getting it wrong.
     */
    public record Details(
        UUID id,
        String organizationName,
        UUID organizationId,
        String maskedEmail,
        String status,
        boolean pending,
        OffsetDateTime createdAt,
        OffsetDateTime expiresAt,
        OffsetDateTime consumedAt,
        OffsetDateTime revokedAt,
        OffsetDateTime updatedAt
    ) {
    }
}
