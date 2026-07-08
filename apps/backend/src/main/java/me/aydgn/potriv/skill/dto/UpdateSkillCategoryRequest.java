package me.aydgn.potriv.skill.dto;

import jakarta.validation.constraints.Size;

/**
 * Partial update payload. A {@code null} field means "leave unchanged". The ID
 * and organization are immutable and are never accepted here.
 */
public record UpdateSkillCategoryRequest(
    @Size(max = 120)
    String name,

    Boolean active
) {

}
