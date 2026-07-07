package me.aydgn.potriv.identity.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public record EmployeeInviteResponse(
    UUID inviteId,
    String inviteUrl,
    boolean active,
    OffsetDateTime createdAt,
    OffsetDateTime expiresAt
) {

}
