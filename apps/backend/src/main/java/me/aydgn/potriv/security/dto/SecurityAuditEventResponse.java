package me.aydgn.potriv.security.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

import me.aydgn.potriv.security.entity.SecurityAuditEventType;

public record SecurityAuditEventResponse(
    UUID id,
    SecurityAuditEventType eventType,
    UUID userId,
    UUID organizationId,
    UUID sessionId,
    UUID actorUserId,
    String normalizedEmail,
    String ipAddress,
    String userAgent,
    boolean success,
    String details,
    OffsetDateTime createdAt
) {

}
