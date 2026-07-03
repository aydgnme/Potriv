package me.aydgn.potriv.identity.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import me.aydgn.potriv.identity.entity.AccessRole;

public record UserDetailResponse(
    UUID userId,
    UUID organizationId,
    String name,
    String email,
    List<AccessRole> roles,
    OffsetDateTime createdAt,
    OffsetDateTime updatedAt
) {

}
