package me.aydgn.potriv.organization.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Stable department view. {@code manager} and {@code memberCount} are populated
 * by later tasks (manager assignment and membership) without changing this shape.
 */
public record DepartmentResponse(
    UUID departmentId,
    String name,
    DepartmentManagerSummary manager,
    long memberCount,
    OffsetDateTime createdAt,
    OffsetDateTime updatedAt
) {

}
