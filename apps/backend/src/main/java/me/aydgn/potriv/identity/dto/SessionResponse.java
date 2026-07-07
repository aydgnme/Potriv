package me.aydgn.potriv.identity.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public record SessionResponse(
    UUID sessionId,
    OffsetDateTime createdAt,
    OffsetDateTime lastSeenAt,
    OffsetDateTime revokedAt,
    String userAgent,
    String ipAddress,
    boolean currentSession
) {

}
