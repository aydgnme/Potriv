package me.aydgn.potriv.skill.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record SkillResponse(
    UUID skillId,
    SkillCategoryRef category,
    String name,
    String description,
    SkillAuthorRef author,
    List<SkillDepartmentRef> departments,
    boolean active,
    OffsetDateTime createdAt,
    OffsetDateTime updatedAt
) {

}
