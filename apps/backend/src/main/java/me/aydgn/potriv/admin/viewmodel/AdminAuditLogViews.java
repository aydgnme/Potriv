package me.aydgn.potriv.admin.viewmodel;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Security audit read models. Free-form {@code details} metadata is
 * intentionally excluded so no secret value stored there can leak.
 */
public final class AdminAuditLogViews {

    private AdminAuditLogViews() {
    }

    public record ListItem(
        UUID id,
        String eventType,
        String actor,
        UUID actorUserId,
        String ipAddress,
        OffsetDateTime createdAt
    ) {
    }

    public record Details(
        UUID id,
        String eventType,
        String actor,
        UUID actorUserId,
        UUID userId,
        UUID organizationId,
        UUID sessionId,
        String ipAddress,
        String userAgent,
        OffsetDateTime createdAt
    ) {
    }
}
