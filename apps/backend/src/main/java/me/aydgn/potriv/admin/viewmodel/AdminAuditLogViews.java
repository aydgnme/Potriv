package me.aydgn.potriv.admin.viewmodel;

import java.time.OffsetDateTime;
import java.util.UUID;
import java.util.stream.Stream;

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
        String outcome,
        String actor,
        UUID actorUserId,
        UUID organizationId,
        String ipAddress,
        OffsetDateTime createdAt
    ) {
    }

    public record Details(
        UUID id,
        String eventType,
        String outcome,
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

    /**
     * Raw audit-log filter inputs, echoed straight back into the filter form so a
     * submitted value survives paging. Nothing here is trusted: parsing happens in
     * {@code AdminAuditQuery}, which drops what it cannot read instead of failing
     * the request.
     */
    public record Filter(
        String eventType,
        String outcome,
        String organizationId,
        String actor,
        String ip,
        String from,
        String to
    ) {

        public static final Filter EMPTY = new Filter(null, null, null, null, null, null, null);

        /** True when any filter was supplied — drives the "Clear filters" link. */
        public boolean active() {
            return Stream.of(eventType, outcome, organizationId, actor, ip, from, to)
                .anyMatch(value -> value != null && !value.isBlank());
        }
    }
}
