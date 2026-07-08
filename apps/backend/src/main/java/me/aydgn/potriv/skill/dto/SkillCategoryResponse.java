package me.aydgn.potriv.skill.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public record SkillCategoryResponse(
    UUID categoryId,
    String name,
    boolean active,
    OffsetDateTime createdAt,
    OffsetDateTime updatedAt
) {

}
