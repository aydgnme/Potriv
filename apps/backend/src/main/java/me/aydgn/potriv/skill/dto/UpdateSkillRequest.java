package me.aydgn.potriv.skill.dto;

import java.util.UUID;

import jakarta.validation.constraints.Size;

/**
 * Partial update payload. A {@code null} field means "leave unchanged". The ID,
 * organization, and author are immutable and are never accepted here.
 */
public record UpdateSkillRequest(
    UUID categoryId,

    @Size(max = 160)
    String name,

    @Size(max = 4000)
    String description,

    Boolean active
) {

}
