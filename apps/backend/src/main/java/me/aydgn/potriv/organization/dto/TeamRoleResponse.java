package me.aydgn.potriv.organization.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public record TeamRoleResponse(
    UUID teamRoleId,
    String name,
    String description,
    boolean active,
    OffsetDateTime createdAt,
    OffsetDateTime updatedAt
) {

}
