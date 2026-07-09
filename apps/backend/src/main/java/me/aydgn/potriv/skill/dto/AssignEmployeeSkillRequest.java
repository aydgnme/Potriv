package me.aydgn.potriv.skill.dto;

import java.util.UUID;

import jakarta.validation.constraints.NotNull;
import me.aydgn.potriv.skill.entity.SkillExperience;
import me.aydgn.potriv.skill.entity.SkillLevel;

public record AssignEmployeeSkillRequest(
    @NotNull UUID skillId,
    @NotNull SkillLevel level,
    @NotNull SkillExperience experience
) {

}
