package me.aydgn.potriv.skill.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public record EmployeeSkillResponse(
    UUID employeeSkillId,
    EmployeeSkillSkillRef skill,
    LevelView level,
    ExperienceView experience,
    OffsetDateTime createdAt,
    OffsetDateTime updatedAt
) {

    public record EmployeeSkillSkillRef(
        UUID skillId,
        String name,
        boolean active,
        SkillCategoryRef category
    ) {
    }

    public record LevelView(
        String code,
        int value,
        String label
    ) {
    }

    public record ExperienceView(
        String code,
        String label
    ) {
    }
}
