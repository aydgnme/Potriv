package me.aydgn.potriv.organization.dto;

import jakarta.validation.constraints.Size;

/**
 * Partial update payload. A {@code null} field means "leave unchanged". The ID
 * and organization are immutable and are never accepted here.
 */
public record UpdateDepartmentRequest(
    @Size(max = 160)
    String name
) {

}
