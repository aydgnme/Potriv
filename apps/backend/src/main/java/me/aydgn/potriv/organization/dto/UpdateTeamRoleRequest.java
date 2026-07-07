package me.aydgn.potriv.organization.dto;

import jakarta.validation.constraints.Size;

/**
 * Partial update payload. A {@code null} field means "leave unchanged". The ID
 * and organization are immutable and are never accepted here.
 */
public record UpdateTeamRoleRequest(
    @Size(max = 120)
    String name,

    @Size(max = 1000)
    String description,

    Boolean active
) {

}
